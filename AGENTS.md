# Clean Code & Development Rules for Invoice Downloader

This file defines style guidelines, rules, and behavioral constraints for the development of this project.

## General Principles
1. **ES Modules**: Always use ES Modules (`import/export` instead of `require`) for backend Node.js development.
2. **Strict Error Handling**: 
   - Every API endpoint must catch errors and return structured responses.
   - Database operations through Prisma must be wrapped in `try/catch` blocks.
3. **Layered Architecture (Separation of Concerns)**:
   - **Controllers**: Handle HTTP requests/responses, request validation, and query parameters parsing. Keep them slim.
   - **Services**: Contain business logic (downloading, parsing XML, database persistence). Services must not directly access Express request/response objects.
   - **Utils/Helpers**: Pure utility functions with no dependency on specific routes or business flows.
4. **Prisma Client Lifecycle**: Always import the shared Prisma instance from `src/utils/db.js` instead of instantiating `new PrismaClient()` in multiple files.
5. **No Parallel Running/Debugging**: Do not run or start the backend server during code execution/testing. The user is already running the debug server, and starting another instance will lead to port conflicts (e.g., PORT 3000).

## Database & Models (SQLite + Prisma)
- Define robust database relations (e.g. Cascade delete for Schedules when a Company is deleted).
- Use proper fields indexing and unique constraints (e.g. `@@unique([invoiceNumber, sellerTaxCode, buyerTaxCode])` on `Invoice`) to prevent duplicates.

## Code Quality & Readability
- **Self-explanatory naming**: Use meaningful variable names (e.g., `taxCode` instead of `mst`, `invoiceDate` instead of `ngay`).
- **Log management**: Output clear logs indicating server processes (e.g., "[Downloader] OCR captcha succeeded") without printing sensitive keys or passwords.
- **Maintain comments**: Preserve helpful docstrings and annotations. Write comments in Vietnamese or English consistently.
