import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './.env' });

const createDemoUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/linkedinDB'
    );
    console.log('Connected to MongoDB');

    // Check if demo user already exists
    const existingUser = await User.findOne({ email: 'demo@example.com' });

    if (existingUser) {
      console.log('Demo user already exists');
      process.exit(0);
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('password123', saltRounds);

    // Create demo user
    const demoUser = new User({
      username: 'demo',
      email: 'demo@example.com',
      password: hashedPassword,
    });

    await demoUser.save();
    console.log('Demo user created successfully');
    console.log('Email: demo@example.com');
    console.log('Password: password123');
  } catch (error) {
    console.error('Error creating demo user:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

createDemoUser();
