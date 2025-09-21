# Overview

SecureChat is an encrypted web chat application designed to prioritize privacy and security. Built as a modern full-stack web application, it enables users to communicate through end-to-end encrypted messaging without relying on traditional email-based authentication. The application features a unique authentication system using username + password + recovery key combinations, ensuring maximum privacy while maintaining user autonomy.

The system is built as a responsive, mobile-first Progressive Web App (PWA) that supports real-time messaging, multimedia sharing, and both direct and group conversations. All messages are encrypted client-side before transmission, ensuring true end-to-end encryption where the server never has access to plain text content.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The client is built using React with TypeScript, utilizing Vite as the build tool and development server. The UI is constructed using shadcn/ui components built on Radix UI primitives, styled with Tailwind CSS for consistent design. The application follows a component-based architecture with clear separation between pages, components, hooks, and utilities.

React Query (TanStack Query) handles server state management and API calls, providing caching, background updates, and optimistic updates. Client-side routing is managed through Wouter, a lightweight routing library. The authentication system uses React Context for state management, with protected routes ensuring secure access control.

Real-time functionality is implemented through WebSocket connections, managed by a custom WebSocket service that handles connection state, message routing, and typing indicators. Client-side encryption utilities use the Web Crypto API for RSA key pair generation and message encryption/decryption.

## Backend Architecture
The server is built with Express.js and TypeScript, following a modular architecture with clear separation of concerns. Authentication is handled through Passport.js with local strategy, using session-based authentication with PostgreSQL session storage via connect-pg-simple.

The API follows RESTful principles for HTTP endpoints while WebSocket connections handle real-time features. Database operations are managed through Drizzle ORM, providing type-safe database queries and migrations. The server implements custom encryption utilities for recovery key generation and management.

WebSocket functionality is integrated directly into the Express server, handling user authentication, message broadcasting, typing status, and connection management. The architecture supports horizontal scaling through stateless design where session data is stored in the database.

## Data Storage Solutions
The application uses PostgreSQL as the primary database, accessed through Drizzle ORM for type-safe operations. The schema is designed with proper relationships between users, conversations, messages, and related entities.

Key tables include:
- Users with encrypted credentials and cryptographic keys
- Conversations supporting both direct and group chat types
- Messages with encrypted content and metadata
- Message status tracking for delivery and read receipts
- Typing status for real-time indicators
- Session storage for authentication persistence

Database migrations are managed through Drizzle Kit, ensuring consistent schema evolution across environments.

## Authentication and Security
The authentication system implements a unique approach combining username/password with cryptographic recovery keys. User passwords are hashed using scrypt with random salts, while recovery keys use SHA-256 hashing for secure storage.

Each user has RSA key pairs generated for end-to-end encryption, with public keys stored server-side and private keys encrypted client-side. The system never stores or transmits plain text messages, maintaining true end-to-end encryption.

Session management uses secure HTTP-only cookies with PostgreSQL-backed session storage. The architecture supports account recovery through recovery keys without email dependency, ensuring maximum privacy.

# External Dependencies

## Database Infrastructure
- **Neon Database**: Serverless PostgreSQL database with WebSocket support for real-time operations
- **connect-pg-simple**: PostgreSQL session store for Express sessions

## UI and Styling Framework
- **Radix UI**: Unstyled, accessible UI primitives for building the component library
- **Tailwind CSS**: Utility-first CSS framework for responsive design
- **Lucide React**: Icon library for consistent iconography

## Development and Build Tools
- **Vite**: Frontend build tool with hot module replacement and optimized production builds
- **TypeScript**: Static type checking across the entire application
- **Drizzle ORM**: Type-safe database operations with schema management
- **React Query**: Server state management with caching and synchronization

## Authentication and Security
- **Passport.js**: Authentication middleware with local strategy support
- **Web Crypto API**: Browser-native cryptographic operations for encryption
- **WebSocket (ws)**: Real-time bidirectional communication between client and server

## Replit-Specific Integrations
- **@replit/vite-plugin-runtime-error-modal**: Development error overlay
- **@replit/vite-plugin-cartographer**: Development tooling integration
- **@replit/vite-plugin-dev-banner**: Development environment indicators