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
  await midd(req, res)
  return res.json(imagekit.getAuthenticationParameters())
}


// const authenticationParameters = imagekit.getAuthenticationParameters()
// return res.json(authenticationParameters)
