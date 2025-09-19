import lib from "../../../components/lib"
const ImageKit = require("imagekit")

const { midd } = lib

const publicKey = process.env.IMAGEKIT_PUBLIC
const privateKey = process.env.IMAGEKIT_PRIVATE

console.log('imagekit !!! ....................................')

var imagekit = new ImageKit({
  publicKey,
  privateKey,
  urlEndpoint: "https://ik.imagekit.io/ei5p3fotk/",
})

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
  return res.json(imagekit.getAuthenticationParameters())
}


// const authenticationParameters = imagekit.getAuthenticationParameters()
// return res.json(authenticationParameters)
