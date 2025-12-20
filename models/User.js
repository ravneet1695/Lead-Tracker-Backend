const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  mobile: {
    type: Number,
    required: [true, 'Mobile number is required'],
    unique: true,
    validate: {
      validator: function (v) {
        return /^[0-9]{10}$/.test(v.toString());
      },
      message: 'Please provide a valid 10-digit mobile number'
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  },
  groups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  }],
  code: {
    type: String,
    unique: true,
    sparse: true
  },
  profileImage: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-generate user code before saving
userSchema.pre('save', async function (next) {
  // Generate code only for new users if not provided
  if (this.isNew && !this.code) {
    try {
      // Find the last user by code
      const lastUser = await this.constructor.findOne({}, { code: 1 })
        .sort({ code: -1 })
        .limit(1);

      let nextNumber = 1;
      if (lastUser && lastUser.code) {
        const match = lastUser.code.match(/USR(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      this.code = `USR${String(nextNumber).padStart(4, '0')}`;
    } catch (error) {
      return next(error);
    }
  }

  // Validate organization requirement based on role
  if (this.isModified('role') || this.isModified('organization') || this.isNew) {
    try {
      const Role = require('./Role');
      const role = await Role.findById(this.role);

      if (role && role.name !== 'super_admin' && !this.organization) {
        return next(new Error('Organization is required for non-super_admin roles'));
      }
    } catch (error) {
      return next(error);
    }
  }

  next();
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Index for faster queries
userSchema.index({ role: 1 });
userSchema.index({ organization: 1 });

module.exports = mongoose.model('User', userSchema);
