import "dotenv/config";
import express from "express";
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
   PLAYFAB CONFIG
================================ */
PlayFabSettings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFabSettings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;

/* ===============================
   EXPRESS (RAILWAY)
================================ */
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("OK"));
app.listen(PORT, () => console.log("Server running on port", PORT));

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
function executeCloudScriptSafe(functionName, params, timeoutMs = 5000) {
  return new Promise(resolve => {
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve({ timeout: true });
      }
    }, timeoutMs);

    PlayFabServer.ExecuteCloudScript(
      {
        FunctionName: functionName,
        FunctionParameter: params
      },
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
   INTERACTIONS
================================ */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "link") {
    await interaction.reply("🔗 Linking your account…");

    const res = await executeCloudScriptSafe(
      "LinkDiscordAccount",
      {
        code: interaction.options.getString("code"),
        discordId: interaction.user.id
      }
    );

    if (res.timeout) {
      await interaction.editReply("❌ Linking timed out.");
      return;
    }

    if (res.error) {
      console.error(res.error);
      await interaction.editReply("❌ PlayFab error.");
      return;
    }

    if (res.result?.success) {
      await interaction.editReply(`✅ ${interaction.user} linked successfully!`);
    } else {
      await interaction.editReply(`❌ ${res.result?.message || "Invalid code"}`);
    }
  }

  if (interaction.commandName === "daily") {
    await interaction.reply("🎁 Checking your daily reward…");

    const res = await executeCloudScriptSafe(
      "DailyReward",
      { discordId: interaction.user.id }
    );

    if (res.timeout) {
      await interaction.editReply("❌ Request timed out.");
      return;
    }

    if (res.error) {
      console.error(res.error);
      await interaction.editReply("❌ PlayFab error.");
      return;
    }

    const r = res.result;

    if (!r?.success) {
      if (r?.remainingMs) {
        const mins = Math.ceil(r.remainingMs / 60000);
        await interaction.editReply(`⏳ ${interaction.user} come back in **${mins} minutes**`);
      } else {
        await interaction.editReply("❌ You must link your account first.");
      }
      return;
    }

    await interaction.editReply(`🎉 ${interaction.user} received **${r.reward} PP**!`);
  }
});

/* ===============================
   LOGIN
================================ */
client.login(process.env.DISCORD_TOKEN);
