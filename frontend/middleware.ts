import { clerkMiddleware } from "@clerk/nextjs/server";

// By default, clerkMiddleware() makes ALL routes public. 
// This is perfect for our architecture because we want guests to access the editor too.
// We handle the actual logic (saving vs. deleting) inside the components based on the user's state.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};