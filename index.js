import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";
import PlayFab from "playfab-sdk";

/* ===============================
   PLAYFAB CONFIG
================================ */
PlayFab.settings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFab.settings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;

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
   SAFE PLAYFAB WRAPPER
================================ */
function executeCloudScriptSafe(functionName, params, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve({ timeout: true });
      }
    }, timeoutMs);

    PlayFab.Server.ExecuteCloudScript(
      {
        FunctionName: functionName,
        FunctionParameter: params
      },
      result => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({ result: result.FunctionResult });
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

  /* ---------- /link ---------- */
  if (interaction.commandName === "link") {
    await interaction.reply("🔗 Linking your account…");

    const response = await executeCloudScriptSafe(
      "LinkDiscordAccount",
      {
        code: interaction.options.getString("code"),
        discordId: interaction.user.id
      }
    );

    if (response.timeout) {
      await interaction.editReply("❌ Linking timed out. Try again.");
      return;
    }

    if (response.error) {
      await interaction.editReply("❌ PlayFab error. Try again.");
      return;
    }

    if (response.result?.success) {
      await interaction.editReply(`✅ ${interaction.user} linked successfully!`);
    } else {
      await interaction.editReply(`❌ ${response.result?.message || "Invalid code"}`);
    }
  }

  /* ---------- /daily ---------- */
  if (interaction.commandName === "daily") {
    await interaction.reply("🎁 Checking your daily reward…");

    const response = await executeCloudScriptSafe(
      "DailyReward",
      { discordId: interaction.user.id }
    );

    if (response.timeout) {
      await interaction.editReply("❌ Request timed out. Try again.");
      return;
    }

    if (response.error) {
      await interaction.editReply("❌ PlayFab error. Try again.");
      return;
    }

    const r = response.result;

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
