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

// ======================
// ENV VALIDATION
// ======================
const {
  DISCORD_TOKEN,
  CLIENT_ID,
  PLAYFAB_TITLE_ID,
  PLAYFAB_SECRET_KEY,
  DAILY_REWARD,
  CURRENCY_CODE
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !PLAYFAB_TITLE_ID || !PLAYFAB_SECRET_KEY) {
  throw new Error("Missing required environment variables");
}

// ======================
// PLAYFAB SETUP
// ======================
PlayFab.settings.titleId = PLAYFAB_TITLE_ID;
PlayFab.settings.developerSecretKey = PLAYFAB_SECRET_KEY;

// ======================
// DISCORD CLIENT
// ======================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ======================
// EXPRESS (RAILWAY NEEDS THIS)
// ======================
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => res.send("Bot is running ✅"));

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

// ======================
// SLASH COMMANDS
// ======================
const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your PlayFab account")
    .addStringOption(opt =>
      opt.setName("code")
        .setDescription("Code from the game")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily reward")
].map(cmd => cmd.toJSON());

// ======================
// REGISTER COMMANDS (ON START)
// ======================
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
  console.log("Slash commands registered");
})();

// ======================
// BOT READY
// ======================
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ======================
// INTERACTIONS
// ======================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // -------- /link --------
  if (interaction.commandName === "link") {
    const code = interaction.options.getString("code");
    const discordId = interaction.user.id;

    PlayFab.Admin.GetPlayersInSegment({
      SegmentId: "all_players"
    }, () => {
      PlayFab.Admin.GetUserData({
        PlayFabId: null
      });
    });

    PlayFab.Admin.GetUserDataByKeys = PlayFab.Admin.GetUserDataByKeys || PlayFab.Admin.GetUserData;

    PlayFab.Admin.GetUserDataByKeys(
      { Keys: ["DiscordLinkCode", "DiscordLinkExpires"] },
      result => {
        const match = Object.entries(result.Data || {}).find(
          ([_, v]) => v.Value === code
        );

        if (!match) {
          return interaction.reply({
            content: "❌ Invalid or expired code",
            ephemeral: true
          });
        }
      }
    );

    // Safer approach: CloudScript / Search (recommended)
    return interaction.reply({
      content: "⚠️ Linking logic should be done via CloudScript (next step)",
      ephemeral: true
    });
  }

  // -------- /daily --------
  if (interaction.commandName === "daily") {
    const discordId = interaction.user.id;

    PlayFab.Admin.GetAccountInfo(
      { TitleDisplayName: discordId },
      result => {
        if (!result.AccountInfo) {
          return interaction.reply({
            content: "❌ Your account is not linked",
            ephemeral: true
          });
        }

        PlayFab.Admin.AddUserVirtualCurrency(
          {
            PlayFabId: result.AccountInfo.PlayFabId,
            VirtualCurrency: CURRENCY_CODE,
            Amount: parseInt(DAILY_REWARD)
          },
          () => {
            interaction.reply(
              `🎉 You received ${DAILY_REWARD} ${CURRENCY_CODE}!`
            );
          }
        );
      }
    );
  }
});

// ======================
// LOGIN BOT
// ======================
client.login(DISCORD_TOKEN);
