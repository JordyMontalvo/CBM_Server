const cors = require('micro-cors')()
const ImageKit = require("imagekit")

const publicKey = process.env.IMAGEKIT_PUBLIC
const privateKey = process.env.IMAGEKIT_PRIVATE

console.log('imagekit !!! ....................................')

var imagekit = new ImageKit({
  publicKey,
  privateKey,
  urlEndpoint: "https://ik.imagekit.io/ei5p3fotk/",
})

export default cors((req, res) => {
  return res.json(imagekit.getAuthenticationParameters())
})


// const authenticationParameters = imagekit.getAuthenticationParameters()
// return res.json(authenticationParameters)
