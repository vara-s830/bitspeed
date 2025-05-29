import app from './app';
import dotenv from 'dotenv';
import prisma from './utils/db'; // Import Prisma client to connect/disconnect

dotenv.config();

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await prisma.$connect(); // Connect to the database
    console.log('Connected to the database');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    process.exit(1); // Exit process if database connection fails
  }
};

startServer();

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  console.log('Disconnected from the database');
});
