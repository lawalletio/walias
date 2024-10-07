import { NextRequest } from "next/server";
import { execSync } from "child_process";
import path from "path";
import { PrismaClient } from "@prisma/client";

import {
  GET,
  POST,
  PUT,
  DELETE,
} from "../../src/app/api/domains/[domain]/(domains)/route";

let prisma: PrismaClient;

const RANDOM_PRIV_KEY =
  "3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b";

const RANDOM_PUB_KEY =
  "92763cc6af957acc8159c3d0fbcd9f00e20b4222c1dcff07107190ff5f3667d8";

beforeAll(async () => {
  // Set up the test database
  const testDbUrl = `file:${path.join(__dirname, "../../prisma/test.db")}`;
  process.env.DATABASE_URL = testDbUrl;

  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testDbUrl },
  });

  // Log PrismaClient configuration if needed for debugging
  prisma = new PrismaClient();
});

afterAll(async () => {
  execSync(`rm ${path.join(__dirname, "../../prisma/test.db")}`, {
    stdio: "inherit",
  });
});

describe("POST /api/domains/[domain]", () => {
  it("should create a new domain", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/domains/newdomain.com",
      {
        method: "POST",
        body: JSON.stringify({
          relays: ["wss://relay1.example.com", "wss://relay2.example.com"],
          adminPubkey: RANDOM_PRIV_KEY,
        }),
      }
    );
    const res = await POST(req, { params: { domain: "newdomain.com" } });

    expect(res.status).toBe(201);
    const data = await res.json();

    expect(data).toHaveProperty("domain", "newdomain.com");

    // Verify the domain was actually created in the database
    const createdDomain = await prisma.domain.findUnique({
      where: { id: "newdomain.com" },
    });

    expect(createdDomain).not.toBeNull();
    expect(createdDomain?.adminPubkey).toBe(RANDOM_PRIV_KEY);
  });

  it("should return 409 if domain already exists", async () => {
    // Create a domain first
    await prisma.domain.create({
      data: {
        id: "existing.com",
        rootPrivateKey: RANDOM_PRIV_KEY,
        adminPubkey: RANDOM_PRIV_KEY,
        verifyKey: "existingVerifyKey789",
        verified: true,
        relays: JSON.stringify([
          "wss://relay1.existing.com",
          "wss://relay2.existing.com",
        ]),
      },
    });

    const req = new NextRequest(
      "http://localhost:3000/api/domains/existing.com",
      {
        method: "POST",
        body: JSON.stringify({
          relays: ["wss://relay1.existing.com", "wss://relay2.existing.com"],
          adminPubkey: RANDOM_PRIV_KEY,
        }),
      }
    );
    const res = await POST(req, { params: { domain: "existing.com" } });

    expect(res.status).toBe(409);
  });

  it("should return 400 for an invalid domain name", async () => {
    const invalidDomain = "invalid domain.com";
    const req = new NextRequest(
      `http://localhost:3000/api/domains/${invalidDomain}`,
      {
        method: "POST",
        body: JSON.stringify({
          relays: ["wss://relay1.example.com", "wss://relay2.example.com"],
          adminPubkey: RANDOM_PRIV_KEY,
        }),
      }
    );
    const res = await POST(req, { params: { domain: invalidDomain } });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty("reason");
    expect(data.reason).toContain("Invalid domain name");
  });
});

describe("GET /api/domains/[domain]", () => {
  it("should retrieve an existing domain", async () => {
    // Create a test domain
    await prisma.domain.create({
      data: {
        id: "testdomain.com",
        rootPrivateKey: RANDOM_PRIV_KEY,
        adminPubkey: RANDOM_PRIV_KEY,
        verifyKey: "testVerifyKey789",
        verified: true,
        relays: JSON.stringify([
          "wss://relay1.test.com",
          "wss://relay2.test.com",
        ]),
      },
    });

    const req = new NextRequest(
      "http://localhost:3000/api/domains/testdomain.com",
      {
        method: "GET",
      }
    );
    const res = await GET(req, { params: { domain: "testdomain.com" } });

    expect(res.status).toBe(200);
    const data = await res.json();

    // Check if the response matches the OpenAPI spec
    expect(data).toEqual({
      domain: "testdomain.com",
      adminPubkey: RANDOM_PRIV_KEY,
      verified: true,
      verifyKey: "testVerifyKey789",
      relays: ["wss://relay1.test.com", "wss://relay2.test.com"],
      rootPubkey: RANDOM_PUB_KEY,
    });
    expect(data).not.toHaveProperty("rootPrivateKey");
    expect(data).toHaveProperty("verifyKey");
  });

  it("should return 404 for a non-existing domain", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/domains/nonexistent.com",
      {
        method: "GET",
      }
    );
    const res = await GET(req, { params: { domain: "nonexistent.com" } });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toEqual({
      reason: "Domain not found",
      success: false,
    });
  });

  it("should return 400 for an invalid domain name", async () => {
    const invalidDomain = "invalid domain.com";
    const req = new NextRequest(
      `http://localhost:3000/api/domains/${invalidDomain}`,
      {
        method: "GET",
      }
    );
    const res = await GET(req, { params: { domain: invalidDomain } });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({
      reason: "Invalid domain name",
    });
  });
});

describe("PUT /api/domains/[domain]", () => {
  const mockDomain = "example.com";
  const validPayload = {
    relays: ["wss://relay1.example.com", "wss://relay2.example.com"],
    adminPubkey: RANDOM_PUB_KEY,
    rootPrivkey: RANDOM_PRIV_KEY,
  };

  beforeEach(async () => {
    // Clear the database and create a test domain before each test
    await prisma.domain.deleteMany();
    await prisma.domain.create({
      data: {
        id: mockDomain,
        rootPrivateKey: RANDOM_PRIV_KEY,
        adminPubkey: RANDOM_PUB_KEY,
        verifyKey: "testVerifyKey789",
        verified: true,
        relays: JSON.stringify(validPayload.relays),
      },
    });
  });

  it("should update a domain when authenticated with admin pubkey", async () => {
    const response = await PUT(
      new NextRequest(`http://localhost/api/domains/${mockDomain}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-authenticated-pubkey": RANDOM_PUB_KEY,
        },
        body: JSON.stringify(validPayload),
      }),
      { params: { domain: mockDomain } }
    );

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({
      domain: mockDomain,
      relays: validPayload.relays,
      adminPubkey: validPayload.adminPubkey,
      rootPubkey: expect.any(String), // The public key derived from rootPrivkey
      verified: true,
    });

    // Verify the domain was actually updated in the database
    const updatedDomain = await prisma.domain.findUnique({
      where: { id: mockDomain },
    });
    expect(updatedDomain).not.toBeNull();
    expect(updatedDomain?.adminPubkey).toBe(validPayload.adminPubkey);
    expect(updatedDomain?.rootPrivateKey).toBe(validPayload.rootPrivkey);
    expect(JSON.parse(updatedDomain?.relays || "[]")).toEqual(
      validPayload.relays
    );
  });

  it("should return 401 when not authenticated", async () => {
    const response = await PUT(
      new NextRequest(`http://localhost/api/domains/${mockDomain}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validPayload),
      }),
      { params: { domain: mockDomain } }
    );

    expect(response.status).toBe(401);
    const responseBody = await response.json();
    expect(responseBody).toEqual({
      reason: "Authentication required",
    });
  });

  it("should return 403 for unauthorized pubkey", async () => {
    const response = await PUT(
      new NextRequest(`http://localhost/api/domains/${mockDomain}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-authenticated-pubkey": "unauthorizedPubkey123",
        },
        body: JSON.stringify(validPayload),
      }),
      { params: { domain: mockDomain } }
    );

    expect(response.status).toBe(403);
    const responseBody = await response.json();
    expect(responseBody).toEqual({
      reason: "Invalid authentication. Must be admin or root",
    });
  });

  it("should return 404 when domain is not found", async () => {
    const nonExistentDomain = "nonexistent.com";
    const response = await PUT(
      new NextRequest(`http://localhost/api/domains/${nonExistentDomain}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-authenticated-pubkey": RANDOM_PUB_KEY,
        },
        body: JSON.stringify(validPayload),
      }),
      { params: { domain: nonExistentDomain } }
    );

    expect(response.status).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toEqual({
      reason: "Domain not found",
    });
  });

  it("should return 400 for invalid payload", async () => {
    const invalidPayload = {
      relays: "not-an-array",
      adminPubkey: "",
      rootPrivkey: 123,
    };

    const response = await PUT(
      new NextRequest(`http://localhost/api/domains/${mockDomain}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-authenticated-pubkey": RANDOM_PUB_KEY,
        },
        body: JSON.stringify(invalidPayload),
      }),
      { params: { domain: mockDomain } }
    );

    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody).toHaveProperty("reason");
    expect(responseBody.reason).toContain("Invalid input");
  });
});

describe("DELETE /api/domains/[domain]", () => {
  it("should delete a domain when authenticated", async () => {
    // Create a test domain
    const testDomain = "delete-test.com";
    await prisma.domain.create({
      data: {
        id: testDomain,
        rootPrivateKey: RANDOM_PRIV_KEY,
        adminPubkey: RANDOM_PUB_KEY,
        verifyKey: "testVerifyKey789",
        verified: true,
        relays: JSON.stringify([]),
      },
    });

    const req = new NextRequest(`http://localhost/api/domains/${testDomain}`, {
      method: "DELETE",
      headers: {
        "x-authenticated-pubkey": RANDOM_PUB_KEY,
      },
    });

    const response = await DELETE(req, { params: { domain: testDomain } });
    expect(response.status).toBe(200);

    const responseBody = await response.json();
    expect(responseBody).toEqual({
      success: true,
    });

    // Verify the domain was deleted
    const deletedDomain = await prisma.domain.findUnique({
      where: { id: testDomain },
    });
    expect(deletedDomain).toBeNull();
  });

  it("should return 401 when not authenticated", async () => {
    const testDomain = "unauthenticated-delete.com";
    const req = new NextRequest(`http://localhost/api/domains/${testDomain}`, {
      method: "DELETE",
    });

    const response = await DELETE(req, { params: { domain: testDomain } });
    expect(response.status).toBe(401);

    const responseBody = await response.json();
    expect(responseBody).toEqual({
      reason: "Authentication required",
    });
  });

  it("should return 404 when trying to delete a non-existent domain", async () => {
    const nonExistentDomain = "non-existent-domain.com";
    const req = new NextRequest(
      `http://localhost/api/domains/${nonExistentDomain}`,
      {
        method: "DELETE",
        headers: {
          "x-authenticated-pubkey": RANDOM_PUB_KEY,
        },
      }
    );

    const response = await DELETE(req, {
      params: { domain: nonExistentDomain },
    });
    expect(response.status).toBe(404);

    const responseBody = await response.json();
    expect(responseBody).toEqual({
      reason: "Domain not found",
    });
  });
});
