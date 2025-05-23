import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session } = db
const { error, success, midd } = lib


export default async (req, res) => {
  await midd(req, res)

  let { session } = req.query

  // valid session
  session = await Session.findOne({ value: session })
  if(!session) return res.json(error('invalid session'))

  // get user
  const user = await User.findOne({ id: session.id })


  if(req.method == 'POST') {

    let { coverage } = req.body

    console.log({ coverage })

    await User.update({ id: user.id }, { coverage })

    // response
    return res.json(success())
  }
}
