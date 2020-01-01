const mongoose = require("mongoose");

const schema = new mongoose.Schema({
	username: {
		type: String,
		required: true,
		unique: true,
		minlength: 3
	},
	favoriteGenre: {
		type: String,
		required: false,
		unique: false,
		minlength: 2
	}
});

module.exports = mongoose.model("User", schema);
