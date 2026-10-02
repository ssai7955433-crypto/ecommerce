import Order from "../models/Order.js";
import Store from "../models/Store.js";
import Product from "../models/Product.js";

export const createOrder = async (req, res) => {
  try {
    const {
      store,
      items,
      shippingAddress,
    } = req.body;

    // --------------------------------
    // BASIC VALIDATION
    // --------------------------------

    if (!store || !items || items.length === 0) {
      return res.status(400).json({
        message: "Store and items are required",
      });
    }

    if (!shippingAddress) {
      return res.status(400).json({
        message: "Shipping address is required",
      });
    }

    // --------------------------------
    // FIND STORE
    // --------------------------------

    const storeExists = await Store.findById(store);

    if (!storeExists) {
      return res.status(404).json({
        message: "Store not found",
      });
    }

    let totalAmount = 0;

    const orderItems = [];

    // --------------------------------
    // VALIDATE PRODUCTS
    // --------------------------------

    for (const item of items) {

      if (
        !item.productId ||
        !item.quantity ||
        item.quantity < 1 ||
        !Number.isInteger(item.quantity)
      ) {
        return res.status(400).json({
          message: "Invalid product quantity",
        });
      }

      const product = await Product.findById(
        item.productId
      );

      if (!product) {
        return res.status(404).json({
          message: "Product not found",
        });
      }

      // --------------------------------
      // IMPORTANT:
      // PRODUCT MUST BELONG TO THIS STORE
      // --------------------------------

      if (
        product.store.toString() !==
        store.toString()
      ) {
        return res.status(400).json({
          message: "Product does not belong to this store",
        });
      }

      let price = product.price;
      let variantName = null;

      // --------------------------------
      // VARIANT PRODUCT
      // --------------------------------

      if (item.variantId) {

        const variant = product.variants.find(
          (itemVariant) => itemVariant._id === item.variantId
        );

        if (!variant) {
          return res.status(404).json({
            message: "Variant not found",
          });
        }

        // Check variant stock
        if (variant.stock < item.quantity) {
          return res.status(400).json({
            message:
              `Insufficient stock for ${product.name} - ${variant.name}`,
          });
        }

        price = variant.price;
        variantName = variant.name;

      } else {

        // --------------------------------
        // NORMAL PRODUCT
        // --------------------------------

        if (product.stock < item.quantity) {
          return res.status(400).json({
            message:
              `Insufficient stock for ${product.name}`,
          });
        }
      }

      // --------------------------------
      // CALCULATE TOTAL
      // --------------------------------

      totalAmount +=
        price * item.quantity;

      // --------------------------------
      // SAVE SNAPSHOT OF PRODUCT DATA
      // --------------------------------

      orderItems.push({
        product: product._id,

        variantId:
          item.variantId || null,

        name: product.name,

        variantName,

        price,

        quantity: item.quantity,
      });
    }

    // --------------------------------
    // CREATE PENDING ORDER
    // --------------------------------

    const order = await Order.create({
      customer: req.user._id,

      store,

      items: orderItems,

      totalAmount,

      shippingAddress,

      status: "PENDING",

      paymentStatus: "PENDING",
    });

    // --------------------------------
    // IMPORTANT:
    // DO NOT REDUCE STOCK HERE
    // --------------------------------

    res.status(201).json({
      message: "Order created successfully",
      order,
    });

  } catch (error) {

    console.error(
      "Create order error:",
      error
    );

    res.status(500).json({
      message: "Failed to create order",
      error: error.message,
    });
  }
};

export const getVendorOrders = async (req, res) => {
  try {
    const store = await Store.findOne({owner: req.user._id,});

    if (!store) {
      return res.status(404).json({
        message: "Store not found",
      });
    }

    const orders = await Order.find({
      store: store._id,
    })
      .populate("customer", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      orders,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch vendor orders",
    });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const store = await Store.findOne({
      owner: req.user._id,
    });

    if (!store) {
      return res.status(404).json({
        message: "Store not found",
      });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      store: store._id,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const allowedStatuses = [
      "CONFIRMED",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid order status",
      });
    }

    // Restore stock when cancelling an order
    if (
      status === "CANCELLED" &&
      order.status !== "CANCELLED"
    ) {
      for (const item of order.items) {
        const product = await Product.findById(item.product);

        if (!product) {
          continue;
        }

        if (item.variantId) {
          const variant = product.variants.find(
            (itemVariant) => itemVariant._id === item.variantId
          );

          if (variant) {
            variant.stock += item.quantity;
          }
        } else {
          product.stock += item.quantity;
        }

        await product.save();
      }
    }

    order.status = status;

    await order.save();

    res.status(200).json({
      message: "Order status updated",
      order,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to update order status",
    });
  }
};

export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      customer: req.user._id,
    })
      .populate("store", "name slug")
      .sort({ createdAt: -1 });

    res.status(200).json({
      orders,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch orders",
    });
  }
};

export const getMyOrderById = async (req, res) => {
  try {
    // console.log("Query params are", req.params)

    const order = await Order.findOne({_id: req.params.id, customer: req.user._id}).populate("store", "name slug");

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    res.status(200).json({
      order,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch order",
    });
  }
};




