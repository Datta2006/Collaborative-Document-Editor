### Collaborative Document Editor

A full-stack, real-time collaborative document editor that allows multiple users to simultaneously create, edit, and share documents. The platform is built to demonstrate modern web development practices, including real-time communication, state management, and a secure API.

-----
Here is the demo video https://drive.google.com/file/d/1dIdPZ2DuNGKNKKwRIfHy9R1sKxSQZ0eC/view?usp=sharing
### Key Features

  * **Real-time Collaboration**: Multiple users can edit the same document simultaneously with live content synchronization and cursor position tracking.
  * **User Authentication**: Secure user registration and login using JSON Web Tokens (JWT) for session management.
  * **Document Management**: Users can create, view, and manage their own documents from a personal dashboard.
  * **Flexible Sharing**: Share documents with other users by username or email, assigning specific permissions (Read Only or Read/Write).
  * **Document Versioning**: Automatically saves and logs document versions, allowing users to browse and restore previous states.
  * **Responsive Design**: A clean, modern user interface built with HTML, CSS, and JavaScript that adapts to different screen sizes.

-----

### Technology Stack

**Front-End**:

  * **HTML5 & CSS3**: For semantic structure and styling.
  * **JavaScript (ES6+)**: Powers all dynamic and interactive features.
  * **Socket.IO Client**: Handles real-time communication with the server.
  * **Font Awesome**: Provides vector icons for the user interface.

**Back-End**:

  * **Node.js**: The server-side runtime environment.
  * **Express.js**: A fast and minimalist web framework for building the RESTful API.
  * **Socket.IO Server**: Enables real-time, bi-directional communication.
  * **JSON Web Tokens (JWT)**: A standard for securing API endpoints and managing user sessions.
  * **Bcrypt**: Used for hashing user passwords to ensure security.

**Database**:

  * **MySQL**: A powerful relational database for storing user data, documents, permissions, and version history.
  * **`mysql2`**: A high-performance MySQL client for Node.js.

-----

### Getting Started

Follow these steps to set up and run the project on your local machine.

#### Prerequisites

  * Node.js (LTS version)
  * MySQL Server

#### 1\. Clone the Repository

```bash
git clone https://github.com/your-username/collaborative-document-editor.git
cd collaborative-document-editor
```

#### 2\. Configure the Database

Create a `.env` file in the root directory and add your MySQL database credentials:

```ini
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=collaborative_editor
JWT_SECRET=your_secret_key
PORT=3000
NODE_ENV=development
```

Run the database setup script to create the necessary tables and sample data:

```bash
node setup.js
```

#### 3\. Install Dependencies and Run the Server

Install the required Node.js packages and start the server:

```bash
npm install
npm start
```

The application will be running at `http://localhost:3000`.

-----

### API Endpoints

The back-end provides a RESTful API for managing user accounts and documents.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/register` | `POST` | Registers a new user. |
| `/api/login` | `POST` | Authenticates a user and returns a JWT. |
| `/api/documents` | `GET` | Fetches all documents owned or shared with the authenticated user. |
| `/api/documents` | `POST` | Creates a new document. |
| `/api/documents/:id` | `GET` | Retrieves a specific document and the user's permission level. |
| `/api/documents/:id` | `PUT` | Updates a document's content and title. |
| `/api/documents/:id/share` | `POST` | Shares a document with another user, assigning `read` or `write` permission. |
| `/api/documents/:id/versions`| `GET` | Fetches the version history of a document. |
