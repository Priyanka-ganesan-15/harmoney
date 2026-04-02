import mongoose from "mongoose";
import { env } from "@/lib/env";

const globalWithMongoose = globalThis as typeof globalThis & {
  mongooseConnection?: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

const cached = globalWithMongoose.mongooseConnection ?? {
  conn: null,
  promise: null,
};

globalWithMongoose.mongooseConnection = cached;

export async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      bufferCommands: false,
    });
  }

  cached.conn = await cached.promise;

  return cached.conn;
}
