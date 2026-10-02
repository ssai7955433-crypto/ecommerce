import { sequelize } from "../models/index.js";

const connectDB = async () => {
  try {
    if (!process.env.MYSQL_URL && !process.env.DATABASE_URL) {
      throw new Error("Set MYSQL_URL or DATABASE_URL in the environment");
    }

    await sequelize.authenticate();
    await sequelize.sync();

    console.log("MySQL connected successfully");
  } catch (error) {
    console.error("MySQL connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDB;