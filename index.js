import 'dotenv/config'
import express from 'express'
import axios from 'axios'
import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes
} from 'discord.js'
import { REST } from '@discordjs/rest'

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  PLAYFAB_TITLE_ID,
  PLAYFAB_SECRET_KEY,
  PLAYFAB_SEGMENT_ID,
  CURRENCY_CODE,
  DAILY_REWARD
} = process.env

if (!DISCORD_TOKEN || !CLIENT_ID || !PLAYFAB_TITLE_ID || !PLAYFAB_SECRET_KEY || !PLAYFAB_SEGMENT_ID) {
  console.error("Missing environment variables.")
  process.exit(1)
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN)

const commands = [
  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your PlayFab account')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('Your in-game link code')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim daily reward')
]

async function registerCommands() {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  )
  console.log("Slash commands registered")
}

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`)
})

async function getAllPlayersWithData() {
  console.log("Using Segment ID:", PLAYFAB_SEGMENT_ID)

  const response = await axios.post(
    `https://${PLAYFAB_TITLE_ID}.playfabapi.com/Admin/GetPlayersInSegment`,
    {
      SegmentId: PLAYFAB_SEGMENT_ID,
      ProfileConstraints: {
        ShowData: true
      }
    },
    {
      headers: {
        "X-SecretKey": PLAYFAB_SECRET_KEY,
        "Content-Type": "application/json"
      }
    }
  )

  return response.data.data.PlayerProfiles
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return

  if (interaction.commandName === 'link') {
    await interaction.deferReply()

    const code = interaction.options.getString('code')

    try {
      const players = await getAllPlayersWithData()

      const matched = players.find(p =>
        p.Profile?.Data?.DiscordLinkCode?.Value === code
      )

      if (!matched) {
        return interaction.editReply("❌ Invalid or expired code.")
      }

      const playfabId = matched.PlayerId

      await axios.post(
        `https://${PLAYFAB_TITLE_ID}.playfabapi.com/Admin/UpdateUserData`,
        {
          PlayFabId: playfabId,
          Data: {
            DiscordId: interaction.user.id
          }
        },
        {
          headers: {
            "X-SecretKey": PLAYFAB_SECRET_KEY,
            "Content-Type": "application/json"
          }
        }
      )

      await interaction.editReply(`✅ Account linked, ${interaction.user}!`)
    } catch (err) {
      console.error("LINK ERROR:", err.response?.data || err.message)
      await interaction.editReply("❌ PlayFab error.")
    }
  }

  if (interaction.commandName === 'daily') {
    await interaction.deferReply()

    try {
      const players = await getAllPlayersWithData()

      const matched = players.find(p =>
        p.Profile?.Data?.DiscordId?.Value === interaction.user.id
      )

      if (!matched) {
        return interaction.editReply("❌ Account not linked.")
      }

      const playfabId = matched.PlayerId

      await axios.post(
        `https://${PLAYFAB_TITLE_ID}.playfabapi.com/Admin/AddUserVirtualCurrency`,
        {
          PlayFabId: playfabId,
          VirtualCurrency: CURRENCY_CODE,
          Amount: parseInt(DAILY_REWARD)
        },
        {
          headers: {
            "X-SecretKey": PLAYFAB_SECRET_KEY,
            "Content-Type": "application/json"
          }
        }
      )

      await interaction.editReply(`💰 ${interaction.user} received ${DAILY_REWARD} ${CURRENCY_CODE}!`)
    } catch (err) {
      console.error("DAILY ERROR:", err.response?.data || err.message)
      await interaction.editReply("❌ PlayFab error.")
    }
  }
})

async function start() {
  await registerCommands()
  await client.login(DISCORD_TOKEN)
}

start()

// Railway health server
const app = express()
app.get('/', (req, res) => res.send("Bot Running"))
app.listen(process.env.PORT || 8080)
