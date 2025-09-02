#!/usr/bin/env node

/**
 * Script to initialize the database for the Calendar MCP Server
 * 
 * This script:
 * 1. Creates the database migration for our schema
 * 2. Applies the migration to the database
 * 3. Generates the Prisma client
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Check if the .env file exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found. Please create it first.');
    console.error('Make sure to set DATABASE_URL in your .env file.');
    process.exit(1);
}

console.log('Initializing database for Calendar MCP Server...');

try {
    // First check if the database exists and is accessible
    console.log('\n1. Checking database connection...');
    try {
        execSync('npx prisma db pull --force', { stdio: 'inherit' });
        console.log('Database connection successful!');
    } catch (connectionError) {
        console.warn('Could not connect to the database. Make sure your database exists and is accessible.');
        console.warn('You may need to create the database first before running this script.');
        
        if (process.env.NODE_ENV === 'production') {
        console.error('In production mode, the database must exist. Aborting.');
        process.exit(1);
        }

        console.log('Continuing with migration creation...');
    }

    // Create and apply migrations
    console.log('\n2. Creating and applying database migrations...');
    execSync('npx prisma migrate dev --name init', { stdio: 'inherit' });
    
    // Generate the Prisma client based on the applied schema
    console.log('\n3. Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });

    console.log('\nDatabase initialization complete!');
    console.log('You can now start the server with: npm start');
    } catch (error) {
    console.error('\nFailed to initialize database:', error.message);
    
    if (error.message.includes('P1001') || error.message.includes('connect to the database')) {
        console.error('\nDatabase connection error. Please check:');
        console.error('1. Your DATABASE_URL in the .env file is correct');
        console.error('2. The database server is running');
        console.error('3. You have created the database specified in your connection string');
        console.error('\nYou may need to create the database first with a command like:');
        console.error('  createdb calendar_mcp');
    }
    
    process.exit(1);
}
