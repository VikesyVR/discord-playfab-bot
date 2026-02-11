import "dotenv/config";
import express from "express";
import axios from "axios";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

import * as PlayFabServer from "playfab-sdk/Scripts/PlayFab/PlayFabServerApi.js";
import PlayFabSettings from "playfab-sdk/Scripts/PlayFab/PlayFabSettings.js";

/* ===============================
   CONFIG
================================ */
PlayFabSettings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFabSettings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;

const app = express();
app.get("/", (_, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

/* ===============================
   DISCORD CLIENT
================================ */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ===============================
   SLASH COMMANDS
================================ */
const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your game account to Discord")
    .addStringOption(o =>
      o.setName("code")
        .setDescription("The code shown in-game")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily reward")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationCommands(process.env.CLIENT_ID),
  { body: commands }
);

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ===============================
   SAFE CLOUDSCRIPT CALL
================================ */
function callCloudScript(name, params, timeout = 5000) {
  return new Promise(resolve => {
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve({ timeout: true });
      }
    }, timeout);

    PlayFabServer.ExecuteCloudScript(
      { FunctionName: name, FunctionParameter: params },
      result => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({ result: result.data.FunctionResult });
      },
      error => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({ error });
      }
    );
  });
}

/* ===============================
   ADMIN GRANT
================================ */
async function grantCurrency(playFabId, amount) {
  return axios.post(
    `https://${process.env.PLAYFAB_TITLE_ID}.playfabapi.com/Admin/AddUserVirtualCurrency`,
    {
      PlayFabId: playFabId,
      VirtualCurrency: "PP",
      Amount: amount
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-SecretKey": process.env.PLAYFAB_SECRET_KEY
      }
    }
  );
}

/* ===============================
   INTERACTIONS
================================ */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  /* ===== LINK ===== */
  if (interaction.commandName === "link") {

    await interaction.reply("🔗 Linking your account...");

    const res = await callCloudScript("LinkDiscordAccount", {
      code: interaction.options.getString("code"),
      discordId: interaction.user.id
    });

    if (res.timeout)
      return interaction.editReply("❌ Linking timed out.");

    if (res.error)
      return interaction.editReply("❌ PlayFab error.");

    if (res.result?.success)
      return interaction.editReply(`✅ ${interaction.user} linked successfully!`);

    return interaction.editReply(`❌ ${res.result?.message || "Invalid code"}`);
  }

  /* ===== DAILY ===== */
  if (interaction.commandName === "daily") {

    await interaction.reply("🎁 Checking your daily reward...");

    const res = await callCloudScript("ResolveDaily", {
      discordId: interaction.user.id
    });

    if (res.timeout)
      return interaction.editReply("❌ Request timed out.");

    if (res.error)
      return interaction.editReply("❌ PlayFab error.");

    const r = res.result;

    if (!r?.success) {
      if (r?.remainingMs) {
        const mins = Math.ceil(r.remainingMs / 60000);
        return interaction.editReply(
          `⏳ ${interaction.user} come back in **${mins} minutes**`
        );
      }
      return interaction.editReply("❌ You must link your account first.");
    }

    try {
      await grantCurrency(r.playFabId, 100);
      return interaction.editReply(
        `🎉 ${interaction.user} received **100 PP**!`
      );
    } catch (e) {
      return interaction.editReply("❌ Currency grant failed.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
