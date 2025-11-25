#!/usr/bin/env node

const { initDb } = require('../db');
const User = require('../models/User');

async function seed() {
  console.log('🌱 Seeding users...');

  try {
    // Initialize database first
    await initDb();

    // Check if user dag already exists
    const existing = User.findByUsername('dag');

    if (existing) {
      console.log('✅ User "dag" already exists');
      process.exit(0);
    }

    // Create admin user dag
    const user = User.create('dag', 'myj0b1s', 'admin');

    console.log('✅ Created admin user:');
    console.log(`   Username: ${user.username}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   ID: ${user.id}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding users:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

seed();
