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
    required: false,
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
    sparse: true
    // Uniqueness enforced by compound index with organization
  },
  profileImage: {
    type: String,
    default: null
  },
  department: {
    type: String,
    required: [true, 'Department is required'],
    trim: true,
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
      if (this.organization) {
        // Organization-specific code generation
        // Get organization to extract its code
        const Organization = require('./Organization');
        const org = await Organization.findById(this.organization);

        if (!org) {
          return next(new Error('Organization not found'));
        }

        // Find the last user in this organization
        const lastUser = await this.constructor.findOne(
          { organization: this.organization },
          { code: 1 }
        )
          .sort({ code: -1 })
          .limit(1);

        let nextNumber = 1;
        if (lastUser && lastUser.code) {
          // Extract number from format: ORG-XXX-USRXXXX
          const match = lastUser.code.match(/USR(\d+)$/);
          if (match) {
            nextNumber = parseInt(match[1]) + 1;
          }
        }

        this.code = `${org.code}-USR${String(nextNumber).padStart(4, '0')}`;
      } else {
        // Global code for super_admin (no organization)
        const lastUser = await this.constructor.findOne(
          { organization: null },
          { code: 1 }
        )
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
      }
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
  if (!this.isModified('password') || !this.password) {
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

// Indexes for faster queries
// Note: email and mobile already have indexes via unique: true
userSchema.index({ role: 1 });   // Filter by role
userSchema.index({ organization: 1 }); // Filter by organization
userSchema.index({ status: 1 }); // Filter by status

// Compound unique index for organization-specific user codes
userSchema.index({ organization: 1, code: 1 }, { unique: true, sparse: true });

// Compound indexes for common query patterns
userSchema.index({ organization: 1, status: 1 }); // Org + status filter
userSchema.index({ organization: 1, role: 1 });   // Org + role filter
userSchema.index({ status: 1, role: 1 });         // Status + role filter
userSchema.index({ createdAt: -1 });              // Sort by creation date

module.exports = mongoose.model('User', userSchema);
