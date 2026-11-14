import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    const i = line.indexOf("=");
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  })
);

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const res = await fetch(`${url}/rest/v1/exercises?select=id,name_en,media_path&limit=3`, { headers });
console.log("service role:", res.status, (await res.text()).slice(0, 300));

const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const res2 = await fetch(`${url}/rest/v1/exercises?select=id,name_en,media_path&limit=3`, {
  headers: { apikey: anon, Authorization: `Bearer ${anon}` }
});
console.log("anon:", res2.status, (await res2.text()).slice(0, 300));
