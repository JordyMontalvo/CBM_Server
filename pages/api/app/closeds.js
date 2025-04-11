import { MongoClient } from "mongodb";
import db from "../../../components/db";
import lib from "../../../components/lib";

const URL = process.env.DB_URL; // Asegúrate de que esta variable esté definida correctamente
const name = process.env.DB_NAME;

const { User, Session, Closed } = db;
const { error, success, midd } = lib;

export default async (req, res) => {
  await midd(req, res);

  let { session } = req.query;

  // valid session
  session = await Session.findOne({ value: session });
  if (!session) return res.json(error("invalid session"));

  // check verified
  const user = await User.findOne({ id: session.id });
  // if(!user.verified) return res.json(error('unverified user'))

  if (req.method === "GET") {
    const { page = 1, limit = 20, startDate, endDate } = req.query;
    const pageNum = parseInt(page, 20);
    const limitNum = parseInt(limit, 20);
    const skip = (pageNum - 1) * limitNum;

    const query = [];
    if (startDate) {
      query.push({ $match: { date: { $gte: new Date(startDate) } } });
    }
    if (endDate) {
      query.push({ $match: { date: { $lte: new Date(endDate) } } });
    }

    query.push(
      { $sort: { date: -1 } }, // Ordenar por fecha de manera descendente
      { $skip: skip },
      { $limit: limitNum }
    );

    try {
      const client = new MongoClient(URL);
      await client.connect();
      const database = client.db(name);

      const closeds = await database
        .collection("closeds")
        .aggregate(query, { allowDiskUse: true })
        .toArray();
      const totalCloseds = await database
        .collection("closeds")
        .countDocuments({}); // Contar documentos que coinciden

      client.close();

      return res.json(
        success({
          closeds,
          total: totalCloseds,
          totalPages: Math.ceil(totalCloseds / limitNum),
          currentPage: pageNum,
        })
      );
    } catch (error) {
      console.error("Database connection error:", error);
      return res.status(500).json(error("Database connection error"));
    }
  }
};
