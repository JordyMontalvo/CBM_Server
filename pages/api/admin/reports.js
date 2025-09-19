import db  from "../../../components/db"
import lib from "../../../components/lib"

const { Affiliation, Activation, Collect, Promo } = db
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
    
    const { filter } = req.query


    if(filter == 'day') {

    	var start = new Date()
    	start.setHours(0,0,0,0)

    	var end = new Date()
    	end.setHours(23,59,59,999)

  		const affiliations = await Affiliation.find({ date: { $gte: start, $lt: end } })
  		const affiliations_count = affiliations.length

      console.log({ start })
      console.log({ end })
  		const activations = await Activation.find({ date: { $gte: start, $lt: end } })
  		const activations_count = activations.length
      
      const collects = await Collect.find({ date: { $gte: start, $lt: end } })
      const collects_count = collects.length

      const promos = await Promo.find({ date: { $gte: start, $lt: end } })      
      const promos_count = promos.length

  		return res.json(success({
  			affiliations,
  			affiliations_count,
  			activations,
  			activations_count,
        collects,
        collects_count,
        promos,
        promos_count,
  		}))
    }

    if(filter == 'month') {

    	var start = new Date()
    	start.setHours(0,0,0,0)
    	start.setDate(1)

    	var end = new Date()
    	end.setHours(23,59,59,999)
    	end.setDate(31)


  		const affiliations = await Affiliation.find({ date: { $gte: start, $lt: end } })
  		const affiliations_count = affiliations.length

  		const activations = await Activation.find({ date: { $gte: start, $lt: end } })
  		const activations_count = activations.length
      
      const collects = await Collect.find({ date: { $gte: start, $lt: end } })
      const collects_count = collects.length

  		return res.json(success({
  			affiliations,
  			affiliations_count,
  			activations,
  			activations_count,
        collects,
        collects_count,
  		}))
    }

  }
}
