const mongoose = require('mongoose');


const UserSchema = new mongoose.Schema({
    publicAddress : { type: String, required: true, unique: true },
    nonce: { type: Number, required: true, default: () => Math.floor(Math.random() * 1000000) }
});

const model = mongoose.model('UserModel', UserSchema);

module.exports = model;