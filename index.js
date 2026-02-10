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
   ENV VALIDATION
================================ */
const {
  DISCORD_TOKEN,
  CLIENT_ID,
  PLAYFAB_TITLE_ID,
  PLAYFAB_SECRET_KEY,
  DAILY_REWARD,
  CURRENCY_CODE
} = process.env;

if (
  !DISCORD_TOKEN ||
  !CLIENT_ID ||
  !PLAYFAB_TITLE_ID ||
  !PLAYFAB_SECRET_KEY
) {
  throw new Error("Missing required environment variables");
}

/* ===============================
   PLAYFAB SETUP
================================ */
PlayFab.settings.titleId = PLAYFAB_TITLE_ID;
PlayFab.settings.developerSecretKey = PLAYFAB_SECRET_KEY;

/* ===============================
   EXPRESS (RAILWAY KEEP-ALIVE)
================================ */
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => res.send("Bot is running ✅"));
app.listen(PORT, () =>
  console.log("Server running on port", PORT)
);

/* ===============================
   DISCORD CLIENT
================================ */
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ===============================
   SLASH COMMAND DEFINITIONS
================================ */
const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your PlayFab account")
    .addStringOption(option =>
      option
        .setName("code")
        .setDescription("Code from the game")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily reward")
].map(cmd => cmd.toJSON());

/* ===============================
   REGISTER SLASH COMMANDS
================================ */
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
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

  /* -------- /link -------- */
  if (interaction.commandName === "link") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const code = interaction.options.getString("code");
      const discordId = interaction.user.id;

      // TEMP CONFIRMATION (PIPELINE TEST)
      // This confirms Discord → Railway → Bot works perfectly
      await interaction.editReply(
        `✅ Link request received.\n\n` +
        `**Code:** ${code}\n` +
        `**Discord ID:** ${discordId}\n\n` +
        `Next step: connect this to PlayFab CloudScript.`
      );

    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ Failed to process link command.");
    }
  }

  /* -------- /daily -------- */
  if (interaction.commandName === "daily") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const reward = parseInt(DAILY_REWARD || "100");
      const currency = CURRENCY_CODE || "PP";

      // TEMP CONFIRMATION
      await interaction.editReply(
        `🎉 Daily reward claimed!\n` +
        `You would receive **${reward} ${currency}**.\n\n` +
        `Next step: enforce PlayFab cooldown + currency grant.`
      );

    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ Failed to claim daily reward.");
    }
  }
});

/* ===============================
   LOGIN BOT
================================ */
client.login(DISCORD_TOKEN);
