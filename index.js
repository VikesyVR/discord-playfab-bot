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
   PLAYFAB SETUP
================================ */
PlayFab.settings.titleId = process.env.PLAYFAB_TITLE_ID;
PlayFab.settings.developerSecretKey = process.env.PLAYFAB_SECRET_KEY;

/* ===============================
   EXPRESS (KEEP RAILWAY ALIVE)
================================ */
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("OK"));
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

/* ===============================
   DISCORD CLIENT
================================ */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ===============================
   SLASH COMMANDS (FIXED)
   ⚠️ DESCRIPTIONS ARE REQUIRED
================================ */
const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your game account to Discord")
    .addStringOption(option =>
      option
        .setName("code")
        .setDescription("The code shown in-game")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily reward")
].map(cmd => cmd.toJSON());

/* ===============================
   REGISTER COMMANDS
================================ */
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("Slash commands registered");
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
})();

/* ===============================
   BOT READY
================================ */
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ===============================
   INTERACTIONS
================================ */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  /* ---------- /link ---------- */
  if (interaction.commandName === "link") {
    await interaction.deferReply();

    let finished = false;
    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        interaction.editReply("❌ Linking timed out. Please try again.");
      }
    }, 2500);

    PlayFab.Server.ExecuteCloudScript(
      {
        FunctionName: "LinkDiscordAccount",
        FunctionParameter: {
          code: interaction.options.getString("code"),
          discordId: interaction.user.id
        }
      },
      res => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);

        if (res?.FunctionResult?.success) {
          interaction.editReply(`✅ ${interaction.user} your Discord is now linked!`);
        } else {
          interaction.editReply(
            `❌ ${res?.FunctionResult?.message || "Link failed"}`
          );
        }
      }
    );
  }

  /* ---------- /daily ---------- */
  if (interaction.commandName === "daily") {
    await interaction.deferReply();

    PlayFab.Server.ExecuteCloudScript(
      {
        FunctionName: "DailyReward",
        FunctionParameter: {
          discordId: interaction.user.id
        }
      },
      res => {
        const r = res?.FunctionResult;

        if (!r?.success) {
          if (r?.remainingMs) {
            const mins = Math.ceil(r.remainingMs / 60000);
            interaction.editReply(
              `⏳ ${interaction.user} come back in **${mins} minutes**`
            );
          } else {
            interaction.editReply("❌ You must link your account first.");
          }
          return;
        }

        interaction.editReply(
          `🎉 ${interaction.user} received **${r.reward} PP**!`
        );
      }
    );
  }
});

/* ===============================
   LOGIN
================================ */
client.login(process.env.DISCORD_TOKEN);
