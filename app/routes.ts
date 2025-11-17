import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("home", "routes/home.tsx"),
  // Handle Chrome DevTools requests to prevent 404 errors
  route(".well-known/appspecific/com.chrome.devtools.json", "routes/chrome-devtools-handler.tsx")
] satisfies RouteConfig;
