import { MongoClient } from "mongodb";
import db from "../../../components/db";
import lib from "../../../components/lib";

const URL = process.env.DB_URL; // Asegúrate de que esta variable esté definida correctamente
const name = process.env.DB_NAME;

const { User, Session, Closed } = db;
const { error, success, midd } = lib;

export default async (req, res) => {
  await lib.midd(req, res);

  if (req.method === "GET") {
    const { limit = 20, startAfter } = req.query;
    const limitNum = parseInt(limit, 20);

    const query = {};
    if (startAfter) {
      try {
        query._id = { $gt: new ObjectId(startAfter) };
      } catch (e) {
        return res.status(400).json(lib.error("startAfter inválido"));
      }
    }

    try {
      const client = new MongoClient(URL);
      await client.connect();
      const database = client.db(name);

      const closeds = await database
        .collection("closeds")
        .find(query, {
          projection: {
            field1: 1,
            field2: 1,
            date: 1,
            users: 1 // <--- aquí estás incluyendo los usuarios
          }
        })
        .sort({ date: -1 })
        .limit(limitNum)
        .toArray();

      await client.close();

      return res.json(lib.success({ closeds }));
    } catch (error) {
      console.error("Database connection error:", error.message);
      return res.status(500).json(lib.error("Database connection error"));
    }
  }
};
