# LinkedIn Backend

A Node.js backend API for storing user details and LinkedIn tokens using MongoDB, with a modern web dashboard for user management.

## Features

- ✅ User registration and management
- ✅ LinkedIn token storage and retrieval
- ✅ RESTful API endpoints
- ✅ MongoDB integration with Mongoose
- ✅ CORS enabled for frontend integration
- ✅ Error handling and validation
- ✅ **NEW: Modern web dashboard with login/signup**
- ✅ **NEW: Cookie-based session management**
- ✅ **NEW: Real-time user data display**

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

## Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd linkedin-backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create environment file**
   Copy the example environment file and configure it:

   ```bash
   cp env.example .env
   ```

   Or create a `.env` file manually:

   ```env
   MONGODB_URI=mongodb://localhost:27017/linkedinDB
   PORT=3000
   NODE_ENV=development
   ```

4. **Start MongoDB**
   Make sure MongoDB is running on your system or use a cloud instance.

5. **Run the application**

   ```bash
   # Development mode (with nodemon)
   npm run dev

   # Production mode
   npm start
   ```

6. **Access the dashboard**
   Open your browser and go to: `http://localhost:8080`

## Dashboard Features

### 🔐 Authentication

- **Sign Up**: Create new user accounts with username, email, password, and optional name fields
- **Login**: Authenticate existing users by email
- **Session Management**: Automatic login persistence using cookies
- **Logout**: Secure logout with cookie cleanup

### 👤 User Management

- **User Profile**: View complete user information
- **Real-time Updates**: Refresh user data from the server
- **User ID Display**: See the unique MongoDB user ID

### 🔗 LinkedIn Integration

- **Token Storage**: Save LinkedIn access tokens, refresh tokens, and expiration dates
- **Token Status**: Visual indicators showing LinkedIn connection status
- **Token Management**: Add, update, and remove LinkedIn tokens

### 🍪 Cookie Management

The dashboard uses cookies to maintain user sessions:

- `userId`: Stores the MongoDB user ID
- `userEmail`: Stores the user's email address
- `username`: Stores the username
- Cookies expire after 7 days by default

## API Endpoints

### Users

| Method | Endpoint         | Description     |
| ------ | ---------------- | --------------- |
| GET    | `/api/users`     | Get all users   |
| GET    | `/api/users/:id` | Get user by ID  |
| POST   | `/api/users`     | Create new user |
| PUT    | `/api/users/:id` | Update user     |
| DELETE | `/api/users/:id` | Delete user     |

### LinkedIn Tokens

| Method | Endpoint                        | Description                    |
| ------ | ------------------------------- | ------------------------------ |
| POST   | `/api/users/:id/linkedin-token` | Store LinkedIn token for user  |
| GET    | `/api/users/:id/linkedin-token` | Get LinkedIn token for user    |
| DELETE | `/api/users/:id/linkedin-token` | Remove LinkedIn token for user |

### Health Check

| Method | Endpoint  | Description           |
| ------ | --------- | --------------------- |
| GET    | `/health` | Health check endpoint |

## Dashboard Usage

### 1. Create Account

1. Visit `http://localhost:8080`
2. Click "Don't have an account? Sign up"
3. Fill in the required fields (username, email, password)
4. Optionally add first and last name
5. Click "Sign Up"

### 2. Login

1. Enter your email and password
2. Click "Login"
3. You'll be automatically redirected to the dashboard

### 3. Manage LinkedIn Tokens

1. In the dashboard, scroll to the "LinkedIn Token Management" section
2. Enter your LinkedIn access token
3. Optionally add refresh token and expiration date
4. Click "Save LinkedIn Token"

### 4. View User Data

- Your user information is displayed in the "User Information" section
- LinkedIn connection status is shown with visual indicators
- Use "Refresh Data" to get the latest information from the server

## API Examples

### Create a User

```bash
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Store LinkedIn Token

```bash
curl -X POST http://localhost:5000/api/users/USER_ID/linkedin-token \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "your_linkedin_access_token",
    "refreshToken": "your_linkedin_refresh_token",
    "expiresAt": "2024-12-31T23:59:59.000Z",
    "tokenType": "Bearer"
  }'
```

### Get User with LinkedIn Token

```bash
curl -X GET http://localhost:5000/api/users/USER_ID
```

## Database Schema

### User Schema

```javascript
{
  username: String (required, unique),
  email: String (required, unique),
  password: String (required),
  firstName: String,
  lastName: String,
  linkedin: LinkedInTokenSchema,
  isActive: Boolean (default: true),
  createdAt: Date,
  updatedAt: Date
}
```

### LinkedIn Token Schema

```javascript
{
  accessToken: String (required),
  refreshToken: String,
  expiresAt: Date,
  tokenType: String (default: 'Bearer')
}
```

## Project Structure

```
linkedin-backend/
├── models/
│   └── User.js          # User and LinkedIn token schemas
├── routes/
│   └── user.js          # User and LinkedIn token routes
├── public/
│   ├── index.html       # Dashboard HTML
│   └── script.js        # Dashboard JavaScript
├── index.js             # Main server file
├── package.json         # Dependencies and scripts
├── env.example          # Environment variables template
└── README.md           # This file
```

## Security Considerations

⚠️ **Important**: This is a basic implementation. For production use, consider:

- [ ] Hash passwords using bcrypt
- [ ] Implement JWT authentication
- [ ] Add input validation (joi, express-validator)
- [ ] Use HTTPS
- [ ] Implement rate limiting
- [ ] Add logging (winston, morgan)
- [ ] Encrypt sensitive data
- [ ] Add API documentation (Swagger)
- [ ] Implement proper session management
- [ ] Add CSRF protection

## Development

### Adding New Features

1. Create models in `models/` directory
2. Create routes in `routes/` directory
3. Import and use routes in `index.js`
4. Update dashboard in `public/` directory

### Environment Variables

- `MONGODB_URI`: MongoDB connection string
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)

## Troubleshooting

### Common Issues

1. **MongoDB Connection Error**

   - Ensure MongoDB is running
   - Check your connection string in `.env`

2. **Dashboard Not Loading**

   - Make sure the server is running on port 3000
   - Check browser console for JavaScript errors

3. **Login Issues**
   - Verify the user exists in the database
   - Check the API response in browser network tab

## License

ISC
