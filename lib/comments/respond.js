// One JSON shape for every comment endpoint, so the page can treat them alike.
export const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })
