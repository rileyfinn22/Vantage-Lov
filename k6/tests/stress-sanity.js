/**
 * Sanity Test - Keep It Simple
 *
 * Just login and hit some endpoints to verify the flow works.
 * No fancy abstractions, just basic k6.
 */

import { check, sleep } from "k6";
import http from "k6/http";

export const options = {
  vus: 20,
  duration: "10s",

  // Let k6 handle cookies automatically
  noCookiesReset: true,

  // Accept self-signed certs on localhost
  insecureSkipTLSVerify: true,

  // All endpoints should respond in under 200ms
  thresholds: {
    "http_req_duration{name:login}": ["p(95)<200"],
    "http_req_duration{name:health}": ["p(95)<200"],
    "http_req_duration{name:myuser}": ["p(95)<200"],
    "http_req_duration{name:salespeople}": ["p(95)<200"],
    "http_req_duration{name:dashboard}": ["p(95)<200"],
    "http_req_duration{name:insights}": ["p(95)<200"],
  },
};

const BASE_URL = __ENV.BASE_URL || "https://localhost:5025";

export default function () {
  // First iteration: login
  if (__ITER === 0) {
    const loginRes = http.post(
      `${BASE_URL}/api/auth/sign-in/email`,
      JSON.stringify({
        email: "admin@v.alexw.codes",
        password: "brazil-tree-fire",
      }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { name: "login" },
      },
    );

    const loginOk = check(loginRes, {
      "login: status 200": (r) => r.status === 200,
      "login: has cookies": (r) => Object.keys(r.cookies).length > 0,
    });

    if (!loginOk) {
      console.error(`VU ${__VU} login failed: ${loginRes.status}`);
      return;
    }

    console.log(`VU ${__VU} logged in successfully`);
  }

  // Hit endpoints in sequence (cookies sent automatically by k6)
  const res1 = http.get(`${BASE_URL}/vantage/health`, {
    tags: { name: "health" },
  });
  check(res1, { "health: 200": (r) => r.status === 200 });

  const res2 = http.get(`${BASE_URL}/vantage/api/myuser`, {
    tags: { name: "myuser" },
  });
  check(res2, { "myuser: 200": (r) => r.status === 200 });

  const res3 = http.get(`${BASE_URL}/vantage/api/salespeople/me`, {
    tags: { name: "salespeople" },
  });
  check(res3, { "salespeople/me: 200": (r) => r.status === 200 });

  const res4 = http.get(`${BASE_URL}/vantage/api/page/dashboard`, {
    tags: { name: "dashboard" },
  });
  check(res4, { "dashboard: 200": (r) => r.status === 200 });

  const res5 = http.get(`${BASE_URL}/vantage/api/insights`, {
    tags: { name: "insights" },
  });
  check(res5, { "insights: 200": (r) => r.status === 200 });

  sleep(1);
}
