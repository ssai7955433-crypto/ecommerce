import "dotenv/config";
import { randomUUID } from "node:crypto";
import { DataTypes, Model, Op, Sequelize } from "sequelize";

const databaseUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;

export const sequelize = new Sequelize(
  databaseUrl || "mysql://root@127.0.0.1:3306/shalinikart",
  {
    dialect: "mysql",
    logging: false,
    dialectOptions:
      process.env.MYSQL_SSL === "true"
        ? { ssl: { rejectUnauthorized: true } }
        : {},
  }
);

const fieldMaps = new WeakMap();
const rawMethods = new WeakMap();

const projectFields = (projection, ModelClass) => {
  if (!projection) return undefined;

  const fields = projection.split(/\s+/).filter(Boolean);
  const excluded = fields.filter((field) => field.startsWith("-"));

  if (excluded.length) {
    return {
      exclude: excluded.map((field) => mappedField(ModelClass, field.slice(1))),
    };
  }

  return {
    include: [...new Set(["_id", ...fields.map((field) => mappedField(ModelClass, field))])],
  };
};

const mappedField = (ModelClass, field) =>
  fieldMaps.get(ModelClass)?.[field] || field;

const translateWhere = (ModelClass, filter = {}) => {
  const where = {};

  for (const [field, value] of Object.entries(filter)) {
    if (field === "$or" || field === "$and") {
      where[field === "$or" ? Op.or : Op.and] = value.map((part) =>
        translateWhere(ModelClass, part)
      );
      continue;
    }

    const key = mappedField(ModelClass, field);
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      const operators = { $in: Op.in, $ne: Op.ne, $gt: Op.gt, $gte: Op.gte, $lt: Op.lt, $lte: Op.lte };
      const translated = {};

      for (const [operator, operand] of Object.entries(value)) {
        translated[operators[operator] || operator] = operand;
      }

      where[key] = translated;
    } else {
      where[key] = value;
    }
  }

  return where;
};

const normalizeInput = (ModelClass, values) => {
  const result = { ...values };
  const maps = fieldMaps.get(ModelClass) || {};

  for (const [alias, column] of Object.entries(maps)) {
    if (Object.hasOwn(result, alias)) {
      result[column] = result[alias];
      delete result[alias];
    }
  }

  return result;
};

const addInclude = (ModelClass, includes, path, projection) => {
  const [alias, ...rest] = path.split(".");
  const association = ModelClass.associations[alias];
  if (!association) return;

  let include = includes.find((entry) => entry.association === association);
  if (!include) {
    include = { association };
    includes.push(include);
  }

  if (projection && !rest.length) {
    include.attributes = projectFields(projection, association.target);
  }

  if (rest.length) {
    include.include ||= [];
    addInclude(association.target, include.include, rest.join("."), projection);
  }
};

class ModelQuery {
  constructor(ModelClass, type, filter) {
    this.ModelClass = ModelClass;
    this.type = type;
    this.filter = filter;
    this.includes = [];
    this.options = {};
    this.isLean = false;
  }

  populate(path, projection) {
    addInclude(this.ModelClass, this.includes, path, projection);
    return this;
  }

  select(projection) {
    this.options.attributes = projectFields(projection, this.ModelClass);
    return this;
  }

  sort(sortObject) {
    this.options.order = Object.entries(sortObject).map(([field, direction]) => [
      mappedField(this.ModelClass, field),
      direction < 0 ? "DESC" : "ASC",
    ]);
    return this;
  }

  limit(count) {
    this.options.limit = count;
    return this;
  }

  lean() {
    this.isLean = true;
    return this;
  }

  async execute() {
    const raw = rawMethods.get(this.ModelClass);
    const options = {
      ...this.options,
      where: translateWhere(this.ModelClass, this.filter),
      include: [...this.includes],
    };

    if (this.ModelClass.modelName === "Order" && !options.include.some((item) => item.association.as === "items")) {
      options.include.push({ association: this.ModelClass.associations.items });
    }

    const result = this.type === "one"
      ? await raw.findOne(options)
      : await raw.findAll(options);

    if (!this.isLean || result == null) return result;
    return Array.isArray(result) ? result.map((item) => item.toJSON()) : result.toJSON();
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }

  finally(callback) {
    return this.execute().finally(callback);
  }
}

class ApiModel extends Model {
  toJSON() {
    const result = super.toJSON();
    const maps = fieldMaps.get(this.constructor) || {};

    for (const [alias, column] of Object.entries(maps)) {
      if (!Object.hasOwn(result, alias) || result[alias] == null) {
        result[alias] = result[column];
      }
      delete result[column];
    }

    for (const field of this.constructor.numericFields || []) {
      if (result[field] != null) result[field] = Number(result[field]);
    }

    return result;
  }

  deleteOne() {
    return this.destroy();
  }
}

class ProductModel extends ApiModel {
  set variants(value) {
    this.setDataValue(
      "variants",
      (value || []).map((variant) => ({
        ...variant,
        _id: variant._id || randomUUID(),
        price: Number(variant.price),
        stock: Number(variant.stock),
      }))
    );
  }
}

const id = {
  type: DataTypes.UUID,
  defaultValue: DataTypes.UUIDV4,
  primaryKey: true,
};

export class User extends ApiModel {}
User.init({
  _id: id,
  name: { type: DataTypes.STRING(50), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: true },
  googleId: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  role: { type: DataTypes.ENUM("SUPER_ADMIN", "VENDOR", "CUSTOMER"), allowNull: false, defaultValue: "CUSTOMER" },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  isEmailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  emailVerificationToken: { type: DataTypes.STRING(255), allowNull: true },
  emailVerificationExpires: { type: DataTypes.DATE, allowNull: true },
}, { sequelize, modelName: "User", tableName: "users", timestamps: true });

export class Store extends ApiModel {}
Store.init({
  _id: id,
  name: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
  slug: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  ownerId: { type: DataTypes.UUID, allowNull: false, unique: true },
}, { sequelize, modelName: "Store", tableName: "stores", timestamps: true });

export class Product extends ProductModel {}
Product.init({
  _id: id,
  name: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  images: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  storeId: { type: DataTypes.UUID, allowNull: false },
  slug: { type: DataTypes.STRING(255), allowNull: true },
  variants: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    set(value) {
      this.setDataValue("variants", (value || []).map((variant) => ({
        ...variant,
        _id: variant._id || randomUUID(),
        price: Number(variant.price),
        stock: Number(variant.stock),
      })));
    },
  },
}, { sequelize, modelName: "Product", tableName: "products", timestamps: true, hooks: { beforeUpdate: (product) => product.changed("variants", true) } });

export class Address extends ApiModel {}
Address.init({
  _id: id,
  userId: { type: DataTypes.UUID, allowNull: false },
  label: { type: DataTypes.ENUM("HOME", "WORK", "OTHER"), allowNull: false, defaultValue: "HOME" },
  name: { type: DataTypes.STRING(255), allowNull: false },
  phone: { type: DataTypes.STRING(50), allowNull: false },
  address: { type: DataTypes.STRING(500), allowNull: false },
  city: { type: DataTypes.STRING(150), allowNull: false },
  state: { type: DataTypes.STRING(150), allowNull: false },
  pincode: { type: DataTypes.STRING(20), allowNull: false },
  isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { sequelize, modelName: "Address", tableName: "addresses", timestamps: true });

export class Order extends ApiModel {}
Order.init({
  _id: id,
  customerId: { type: DataTypes.UUID, allowNull: false },
  storeId: { type: DataTypes.UUID, allowNull: false },
  totalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  shippingAddress: { type: DataTypes.JSON, allowNull: false },
  status: { type: DataTypes.ENUM("PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"), allowNull: false, defaultValue: "PENDING" },
  paymentStatus: { type: DataTypes.ENUM("PENDING", "PAID", "FAILED"), allowNull: false, defaultValue: "PENDING" },
}, { sequelize, modelName: "Order", tableName: "orders", timestamps: true });

export class OrderItem extends ApiModel {}
OrderItem.init({
  _id: id,
  orderId: { type: DataTypes.UUID, allowNull: false },
  productId: { type: DataTypes.UUID, allowNull: true },
  variantId: { type: DataTypes.STRING(64), allowNull: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  variantName: { type: DataTypes.STRING(255), allowNull: true },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
}, { sequelize, modelName: "OrderItem", tableName: "order_items", timestamps: true });

User.hasOne(Store, { as: "store", foreignKey: "ownerId", onDelete: "CASCADE" });
Store.belongsTo(User, { as: "owner", foreignKey: "ownerId" });
Store.hasMany(Product, { as: "products", foreignKey: "storeId", onDelete: "CASCADE" });
Product.belongsTo(Store, { as: "store", foreignKey: "storeId" });
User.hasMany(Address, { as: "addresses", foreignKey: "userId", onDelete: "CASCADE" });
Address.belongsTo(User, { as: "user", foreignKey: "userId" });
User.hasMany(Order, { as: "orders", foreignKey: "customerId" });
Order.belongsTo(User, { as: "customer", foreignKey: "customerId" });
Store.hasMany(Order, { as: "orders", foreignKey: "storeId" });
Order.belongsTo(Store, { as: "store", foreignKey: "storeId" });
Order.hasMany(OrderItem, { as: "items", foreignKey: "orderId", onDelete: "CASCADE" });
OrderItem.belongsTo(Order, { as: "order", foreignKey: "orderId" });
Product.hasMany(OrderItem, { as: "orderItems", foreignKey: "productId" });
OrderItem.belongsTo(Product, { as: "product", foreignKey: "productId" });

const configureModel = (ModelClass, aliases = {}, numericFields = []) => {
  fieldMaps.set(ModelClass, aliases);
  ModelClass.numericFields = numericFields;
  for (const [alias, column] of Object.entries(aliases)) {
    Object.defineProperty(ModelClass.prototype, alias, {
      configurable: true,
      get() {
        return this.getDataValue(alias) ?? this.getDataValue(column);
      },
      set(value) {
        this.setDataValue(column, value);
      },
    });
  }
  const raw = {
    findOne: ModelClass.findOne.bind(ModelClass),
    findAll: ModelClass.findAll.bind(ModelClass),
    create: ModelClass.create.bind(ModelClass),
    count: ModelClass.count.bind(ModelClass),
    update: ModelClass.update.bind(ModelClass),
    destroy: ModelClass.destroy.bind(ModelClass),
  };
  rawMethods.set(ModelClass, raw);

  ModelClass.findOne = (filter = {}) => new ModelQuery(ModelClass, "one", filter);
  ModelClass.find = (filter = {}) => new ModelQuery(ModelClass, "many", filter);
  ModelClass.findById = (value) => new ModelQuery(ModelClass, "one", { _id: value });
  ModelClass.countDocuments = (filter = {}) => raw.count({ where: translateWhere(ModelClass, filter) });
  ModelClass.findByIdAndDelete = (value) => raw.destroy({ where: { _id: value } });
  ModelClass.deleteOne = (filter = {}) => raw.destroy({ where: translateWhere(ModelClass, filter) });
  ModelClass.updateMany = (filter = {}, update = {}) => raw.update(
    normalizeInput(ModelClass, update.$set || update),
    { where: translateWhere(ModelClass, filter) }
  );
  ModelClass.create = async (values, options) => {
    if (ModelClass === Order) {
      const { items = [], ...orderValues } = values;
      return sequelize.transaction(async (transaction) => {
        const order = await raw.create(normalizeInput(ModelClass, orderValues), {
          ...options,
          transaction,
        });
        const orderItems = await OrderItem.bulkCreate(
          items.map((item) => normalizeInput(OrderItem, { ...item, order: order._id })),
          { ...options, transaction }
        );
        order.setDataValue("items", orderItems);
        return order;
      });
    }

    return raw.create(normalizeInput(ModelClass, values), options);
  };
};

configureModel(User);
configureModel(Store, { owner: "ownerId" });
configureModel(Product, { store: "storeId" }, ["price", "stock"]);
configureModel(Address, { user: "userId" });
configureModel(Order, { customer: "customerId", store: "storeId" }, ["totalAmount"]);
configureModel(OrderItem, { order: "orderId", product: "productId" }, ["price", "quantity"]);

export const isValidId = (value) =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export { DataTypes, Op };
