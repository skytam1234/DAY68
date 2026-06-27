---
name: backend-api-development
description: Build production-grade RESTful APIs with Node.js, Express, and MySQL. Use this skill when implementing API endpoints, CRUD operations, request handling, response formatting, or any backend server logic.
---

This skill guides the development of robust, scalable backend APIs following industry best practices.

## Project Structure

Organize your Express.js project with a modular structure:

```
src/
├── config/          # Environment configuration
├── controllers/     # Request handlers
├── middleware/      # Express middleware
├── models/          # Prisma schema and types
├── routes/          # Route definitions
├── services/        # Business logic
├── utils/           # Helper functions
├── validators/      # Request validation schemas
└── app.ts           # Express app setup
```

## Core Principles

1. **Separation of Concerns**: Keep controllers thin, push logic to services
2. **Dependency Injection**: Use services in controllers for testability
3. **Type Safety**: Leverage TypeScript for all server-side code
4. **Error Handling**: Centralized error handling middleware
5. **Validation**: Validate all inputs before processing

## Implementation Guidelines

### Controller Pattern
```typescript
// controllers/user.controller.ts
export class UserController {
  constructor(private readonly userService: UserService) {}

  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search } = req.query;
      const users = await this.userService.findAll({ page, limit, search });
      return res.success(users);
    } catch (error) {
      next(error);
    }
  }
}
```

### Service Pattern
```typescript
// services/user.service.ts
export class UserService {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(params: QueryParams) {
    const { page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;
    
    const where = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    } : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where })
    ]);

    return {
      data: users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }
}
```

### Response Format
```typescript
// utils/response.ts
export const successResponse = (res: Response, data: any, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString()
  });
};

export const errorResponse = (res: Response, message: string, statusCode = 500, errors?: any) => {
  return res.status(statusCode).json({
    success: false,
    error: message,
    errors,
    timestamp: new Date().toISOString()
  });
};
```

## Best Practices

- Use async/await with proper try-catch in all controller methods
- Implement request validation using Zod schemas
- Use transactions for operations affecting multiple tables
- Implement soft deletes with deletedAt field
- Add proper database indexes for query optimization
- Use cursor-based pagination for large datasets
- Implement proper logging with correlation IDs
- Handle graceful shutdown with proper cleanup
