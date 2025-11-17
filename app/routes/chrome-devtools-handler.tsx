// Chrome DevTools handler - returns empty response to prevent 404 errors
export async function loader() {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
}

export default function ChromeDevToolsHandler() {
  return null; // This component should never be rendered
}