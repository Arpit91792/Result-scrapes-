const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
      username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
            maxlength: 50,
      },
      email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
      },
      passwordHash: {
            type: String,
            required: true,
      },
      role: {
            type: String,
            enum: ['user', 'admin', 'college_admin'],
            default: 'user',
      },
      collegeCode: {
            type: String,
            trim: true,
      },
      collegeName: {
            type: String,
            trim: true,
      },
      isActive: {
            type: Boolean,
            default: true,
      },
      lastLogin: Date,
}, {
      timestamps: true,
});

// Hash password before saving
userSchema.pre('save', async function (next) {
      if (!this.isModified('passwordHash')) return next();
      this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
      next();
});

userSchema.methods.comparePassword = async function (password) {
      return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toSafeObject = function () {
      const obj = this.toObject();
      delete obj.passwordHash;
      return obj;
};

module.exports = mongoose.model('User', userSchema);
