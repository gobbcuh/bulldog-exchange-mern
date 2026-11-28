
const mongoose = require("mongoose");
const campusGroups = require("../../../shared/campuses.json");

const allowedCampuses = campusGroups.flatMap((group) =>
  group.campuses.map((campus) => campus.value)
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    campus: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      enum: allowedCampuses,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("User", userSchema);
