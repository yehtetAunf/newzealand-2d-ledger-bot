import { updateLicense, getUsers } from "./database.js";

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
  return Number(chatId) === Number(env.ADMIN_ID);
}
