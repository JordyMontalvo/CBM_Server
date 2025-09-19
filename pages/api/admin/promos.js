import db  from "../../../components/db"
import lib from "../../../components/lib"

const { Banner, User } = db
const { error, success, midd } = lib


export default async (req, res) => {
  // CORS headers directos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }


  await midd(req, res)

  if(req.method == 'GET') {

    // get promos
    let banner = await Banner.findOne({})

    // response
    return res.json(success({ banner }))
  }

  if(req.method == 'POST') {

    const { id, img, pos } = req.body
    console.log({ id, img, pos })

    if(pos == 1) await Banner.update({ id }, { img })
    if(pos == 2) await Banner.update({ id }, { img2: img })
    if(pos == 3) await Banner.update({ id }, { img3: img })

    return res.json(success())
  }
}
