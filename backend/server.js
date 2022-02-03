import http from 'http';
import { Server } from 'socket.io';
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import productRouter from './routers/productRouter.js';
import userRouter from './routers/userRouter.js';
import orderRouter from './routers/orderRouter.js';
import uploadRouter from './routers/uploadRouter.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL, {});
    console.log('**DB connected**');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

connectDB();

app.use('/api/uploads', uploadRouter);
app.use('/api/products', productRouter);
app.use('/api/users', userRouter);
app.use('/api/orders', orderRouter);

app.get('/api/config/paypal', (req, res) => {
  res.send(process.env.PAYPAL_CLIENT_ID || 'sb');
});
app.get('/api/config/google', (req, res) => {
  res.send(process.env.GOOGLE_API_KEY || '');
});
const __dirname = path.resolve();
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));
app.use(express.static(path.join(__dirname, '/frontend/build')));
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, '/frontend/build/index.html'))
);


// app.get('/', (req, res) => {
//   res.send('Server is ready');
// });

app.use((err, req, res, next) => {
  res.status(500).send({ message: err.message });
});

const port = process.env.PORT || 5000;

const httpServer = http.Server(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const users = [];

//.on(connection) runs when there is a new user in the client
io.on('connection', (socket) => {
  socket.on('disconnect', () => {
    // function that we run when a user disconnects from the server or when user close app or browser
    const user = users.find((x) => x.socketId === socket.id);

    //if user exists, then make the user offline
    if (user) {
      user.online = false;
      console.log('offline', user.name);
      //check if there is an admin and the admin is online, then show message to admin
      const admin = users.find((x) => x.isAdmin && x.online);
      if (admin) {
        //then send the user parameter to the admin
        io.to(admin.socketId).emit('updateUser', user);
      }
    }
  });

  socket.on('onLogin', (user) => {
    const updatedUser = {
      ...user,
      online: true,
      socketId: socket.id, //coming from socket.io from io.on(connection)
      messages: [], //no message just reset the messages
    };
    const existUser = users.find((x) => x._id === updatedUser._id);
    if (existUser) {
      //if user exists then update its socketId and make it online, otherwise its a new user
      existUser.socketId = socket.id;
      existUser.online = true;
    } else {
      users.push(updatedUser);
    }
    console.log('Online', user.name);
    const admin = users.find((x) => x.isAdmin && x.online);
    if (admin) {
      //updatedUser = new users infomation
      io.to(admin.socketId).emit('updateUser', updatedUser);
    }
    if (updatedUser.isAdmin) {
      io.to(updatedUser.socketId).emit('listUsers', users);
    }
  });

  socket.on('onUserSelected', (user) => {
    const admin = users.find((x) => x.isAdmin && x.online);
    if (admin) {
      const existUser = users.find((x) => x._id === user._id);
      //if the user exist pass the current information
      io.to(admin.socketId).emit('selectUser', existUser);
    }
  });

  //it runs when there is a new message entered by admin or by a user
  socket.on('onMessage', (message) => {
    if (message.isAdmin) {
      //message._id is the receiver of the message, and make sure the user is online
      const user = users.find((x) => x._id === message._id && x.online);
      if (user) {
        io.to(user.socketId).emit('message', message);
        user.messages.push(message); //to have message history between admin and user
      }
    } else {
      //this part the user is not admin just regular user
      const admin = users.find((x) => x.isAdmin && x.online);
      if (admin) {
        io.to(admin.socketId).emit('message', message);
        //find the user and push the message
        const user = users.find((x) => x._id === message._id && x.online);
        user.messages.push(message);
        //when admin is not online
        // io.to(socket.id).emit('message', {
        //   name: 'Admin',
        //   body: 'Sorry. I am not online right now',
        // });
      }
    }
  });
});

httpServer.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
