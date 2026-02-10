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
   EXPRESS (RAILWAY KEEP-ALIVE)
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
   SLASH COMMANDS
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
   READY
================================ */
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/* ===============================
   INTERACTIONS
================================ */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  /* ===============================
     /link
  ================================ */
  if (interaction.commandName === "link") {
    await interaction.deferReply();

    let replied = false;

    const timeout = setTimeout(() => {
      if (!replied) {
        replied = true;
        interaction.editReply("❌ Linking timed out. Please try again.");
      }
    }, 3000);

    PlayFab.Server.ExecuteCloudScript(
      {
        FunctionName: "LinkDiscordAccount",
        FunctionParameter: {
          code: interaction.options.getString("code"),
          discordId: interaction.user.id
        }
      },
      result => {
        if (replied) return;
        replied = true;
        clearTimeout(timeout);

        const r = result?.FunctionResult;

        if (r?.success) {
          interaction.editReply(`✅ ${interaction.user} your account is now linked!`);
        } else {
          interaction.editReply(`❌ ${r?.message || "Link failed"}`);
        }
      }
    );
  }

  /* ===============================
     /daily
  ================================ */
  if (interaction.commandName === "daily") {
    await interaction.deferReply();

    let replied = false;

    const timeout = setTimeout(() => {
      if (!replied) {
        replied = true;
        interaction.editReply("❌ Request timed out. Try again.");
      }
    }, 3000);

    PlayFab.Server.ExecuteCloudScript(
      {
        FunctionName: "DailyReward",
        FunctionParameter: {
          discordId: interaction.user.id
        }
      },
      result => {
        if (replied) return;
        replied = true;
        clearTimeout(timeout);

        const r = result?.FunctionResult;

        if (!r?.success) {
          if (r?.remainingMs) {
            const mins = Math.ceil(r.remainingMs / 60000);
            interaction.editReply(`⏳ ${interaction.user} come back in **${mins} minutes**`);
          } else {
            interaction.editReply("❌ You must link your account first.");
          }
          return;
        }

        interaction.editReply(`🎉 ${interaction.user} received **${r.reward} PP**!`);
      }
    );
  }
});

/* ===============================
   LOGIN
================================ */
client.login(process.env.DISCORD_TOKEN);
