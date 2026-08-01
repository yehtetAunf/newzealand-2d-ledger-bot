import { updateLicense, getUsers } from "./database.js";

const DEFAULT_ADMIN_ID = 8840114917;

export async function approveUser(db, chatId, plan, expiresAt) {
  return updateLicense(
    db,
    chatId,
    "approved",
    plan,
    expiresAt
  );
}

export async function banUser(db, chatId) {
  return updateLicense(
    db,
    chatId,
    "banned",
    "none",
    null
  );
}

export async function listUsers(db) {
  return getUsers(db);
}

export function isAdmin(chatId, env) {
  const adminId =
    Number(env.ADMIN_ID) || DEFAULT_ADMIN_ID;

  return Number(chatId) === adminId;
}
