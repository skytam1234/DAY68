---
name: database-migration-prisma
description: Manage database schemas, migrations, and data operations using Prisma 7 with MySQL. Use this skill for schema design, migration management, seeding, and database optimization.
---

This skill guides database operations using Prisma 7 with MySQL, covering schema design, migrations, and data management.

## Prisma Schema Design

### Model Definition
```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  password  String
  avatar    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  
  messages     Message[]
  conversations ConversationParticipant[]

  @@index([email])
  @@index([deletedAt])
}

model Message {
  id             String   @id @default(uuid())
  content        String   @db.Text
  senderId       String
  conversationId String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  readAt         DateTime?
  
  sender       User          @relation(fields: [senderId], references: [id])
  conversation Conversation  @relation(fields: [conversationId], references: [id])

  @@index([senderId])
  @@index([conversationId])
  @@index([createdAt])
}

model Conversation {
  id        String   @id @default(uuid())
  type      ConversationType @default(DIRECT)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages      Message[]
  participants  ConversationParticipant[]
}

enum ConversationType {
  DIRECT
  GROUP
}

model ConversationParticipant {
  id             String   @id @default(uuid())
  conversationId String
  userId         String
  role           ParticipantRole @default(MEMBER)
  joinedAt       DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id])
  user         User         @relation(fields: [userId], references: [id])

  @@unique([conversationId, userId])
}

enum ParticipantRole {
  ADMIN
  MEMBER
}
```

## Migration Workflow

### 1. Initialize Prisma
```bash
npx prisma init
```

### 2. Create Migration
```bash
# Development
npx prisma migrate dev --name add_users_table

# Production
npx prisma migrate deploy
```

### 3. Apply Schema Changes
```bash
# After schema modification
npx prisma migrate dev --name add_last_seen_column

# Reset database (development only!)
npx prisma migrate reset
```

### 4. Generate Client
```bash
npx prisma generate
```

## Common Operations

### Create with Relations
```typescript
const conversation = await prisma.conversation.create({
  data: {
    type: 'DIRECT',
    participants: {
      create: [
        { userId: user1Id, role: 'ADMIN' },
        { userId: user2Id, role: 'MEMBER' }
      ]
    }
  },
  include: {
    participants: {
      include: { user: { select: { id: true, name: true, avatar: true } } }
    }
  }
});
```

### Complex Queries
```typescript
// Get user's conversations with latest message
const conversations = await prisma.conversation.findMany({
  where: {
    participants: {
      some: { userId: currentUserId }
    }
  },
  include: {
    participants: {
      include: { user: { select: { id: true, name: true, avatar: true } } }
    },
    messages: {
      orderBy: { createdAt: 'desc' },
      take: 1
    }
  },
  orderBy: { updatedAt: 'desc' }
});
```

### Transactions
```typescript
const result = await prisma.$transaction(async (tx) => {
  const message = await tx.message.create({
    data: { content, senderId, conversationId }
  });
  
  await tx.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() }
  });
  
  return message;
});
```

### Pagination Patterns
```typescript
// Offset pagination
const users = await prisma.user.findMany({
  where: { deletedAt: null },
  skip: (page - 1) * limit,
  take: limit,
  orderBy: { createdAt: 'desc' }
});

// Cursor pagination (better for large datasets)
const messages = await prisma.message.findMany({
  where: { conversationId },
  cursor: { id: cursor },
  take: limit + 1,
  orderBy: { createdAt: 'desc' }
});
```

## Best Practices

1. **Always use transactions** for operations affecting multiple tables
2. **Add indexes** for frequently queried fields
3. **Use soft deletes** (deletedAt) for important data
4. **Leverage select/include** to avoid over-fetching
5. **Use raw queries sparingly** - only when Prisma cannot achieve the same
6. **Run prisma generate** after schema changes
7. **Test migrations** in development before production
8. **Backup production database** before major migrations
