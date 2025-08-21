import mongoose from 'mongoose';

// LinkedIn Token Schema (Child Schema)
const LinkedInTokenSchema = new mongoose.Schema(
  {
    lastExtracted: {
      type: Date,
    },
    extractionCount: {
      type: Number,
      default: 0,
    },
    tokenType: {
      type: String,
      default: 'Bearer',
    },
  },
  {
    _id: false,
    timestamps: true,
  }
);

// Device Schema (Child Schema)
const DeviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
    },
    deviceName: {
      type: String,
      required: true,
    },
    browser: {
      type: String,
      default: 'Chrome',
    },
    platform: {
      type: String,
      default: 'Desktop',
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: false,
    timestamps: true,
  }
);

// User Settings Schema (Child Schema)
const UserSettingsSchema = new mongoose.Schema(
  {
    keywords: {
      type: [String],
      default: [
        'Saas',
        'development',
        'web developer',
        'freelance website development',
        'AI tools',
        'Product hunt',
      ],
      validate: {
        validator: function (v) {
          return v.length <= 6;
        },
        message: 'Maximum 6 keywords allowed',
      },
    },
    postsPerDay: {
      type: Number,
      default: 1,
      min: 1,
      max: 100,
    },
    engagementLevel: {
      type: String,
      enum: ['low', 'moderate', 'high'],
      default: 'moderate',
    },
    startTime: {
      type: String,
      default: '09:00',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: false,
    timestamps: true,
  }
);

// Cookie Schema (Child Schema)
const CookieSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      required: true,
    },
    domain: {
      type: String,
      default: null,
    },
    path: {
      type: String,
      default: '/',
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    maxAge: {
      type: Number,
      default: null,
    },
    secure: {
      type: Boolean,
      default: false,
    },
    httpOnly: {
      type: Boolean,
      default: false,
    },
    sameSite: {
      type: String,
      enum: ['Strict', 'Lax', 'None'],
      default: 'Lax',
    },
    deviceId: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: false, // Don't create separate _id for embedded documents
    timestamps: true,
  }
);

// Extension Pairing Schema (Child Schema)
const ExtensionPairingSchema = new mongoose.Schema(
  {
    isPaired: {
      type: Boolean,
      default: false,
    },
    userEmail: {
      type: String,
      required: false,
    },
    authToken: {
      type: String,
      required: false,
    },
    initiatedAt: {
      type: Date,
      default: null,
    },
    pairedAt: {
      type: Date,
      default: null,
    },
    lastActive: {
      type: Date,
      default: null,
    },
    lastAttempt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
    timestamps: true,
  }
);

// User Schema (Parent Schema)
const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    linkedin: LinkedInTokenSchema, // Embedded child schema
    devices: [DeviceSchema], // Array of devices
    cookies: [CookieSchema], // Array of cookies with device tracking
    settings: UserSettingsSchema, // User automation settings
    extensionPairing: ExtensionPairingSchema, // Extension pairing status
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

UserSchema.pre('save', async function (next) {
  if (this.isModified('cookies')) {
    this.cookies = this.cookies.map((cookie) => {
      if (cookie.value && !cookie.encrypted) {
        const encryptedData = encryptCookie(cookie.value);
        return {
          ...cookie.toObject(),
          value: JSON.stringify(encryptedData),
          encrypted: true,
        };
      }
      return cookie;
    });
  }
  next();
});
// Create indexes for better query performance
UserSchema.index({ 'cookies.name': 1 });
UserSchema.index({ 'cookies.deviceId': 1 });
UserSchema.index({ 'devices.deviceId': 1 });

const User = mongoose.model('User', UserSchema);

export default User;
