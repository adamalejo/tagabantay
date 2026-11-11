// discord.js v14 | Node 18 | Autoban — bans non-whitelisted members on join
// Whitelist stored in whitelist.json, persists across restarts
// Slash: /whitelist add <user> | /whitelist remove <user> | /whitelist list

import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import 'dotenv/config';
import fs from 'fs';

const WL_FILE = './whitelist.json';

function loadWL() {
  if (fs.existsSync(WL_FILE)) return new Set(JSON.parse(fs.readFileSync(WL_FILE, 'utf8')));
  // default whitelist — usernames (lowercase) or user IDs
  return new Set(['_another1_', 'ftgw']);
}

function saveWL(set) {
  fs.writeFileSync(WL_FILE, JSON.stringify([...set], null, 2));
}

let whitelist = loadWL();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', () => {
  console.log(`[Autoban] online as ${client.user.tag}`);
  console.log(`[Autoban] whitelist: ${[...whitelist].join(', ')}`);
  client.user.setActivity('Watching the gate', { type: 3 });
});

// ── autoban on join ───────────────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  // check by user ID or username (lowercase)
  const id       = member.user.id;
  const username = member.user.username.toLowerCase();
  const tag      = member.user.tag?.toLowerCase();

  const allowed = whitelist.has(id) || whitelist.has(username) || whitelist.has(tag);

  if (allowed) {
    console.log(`[Autoban] ✅ allowed: ${member.user.username} (${id})`);
    return;
  }

  try {
    await member.ban({ reason: 'Not whitelisted', deleteMessageSeconds: 0 });
    console.log(`[Autoban] 🔨 banned: ${member.user.username} (${id})`);

    // log to webhook if set
    if (process.env.WEBHOOK_URL) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '🔨 Auto-Banned',
            color: 0xed4245,
            fields: [
              { name: '👤 User',     value: `${member.user.username} (\`${id}\`)`, inline: true },
              { name: '📅 Joined',   value: new Date().toUTCString(),              inline: true },
              { name: '📋 Reason',   value: 'Not whitelisted',                     inline: true },
            ],
            thumbnail: { url: member.user.displayAvatarURL() },
            timestamp: new Date().toISOString(),
          }],
        }),
      });
    }
  } catch (err) {
    console.error(`[Autoban] failed to ban ${member.user.username}:`, err.message);
  }
});

// ── slash commands ────────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Admins only.', ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();

  switch (interaction.commandName) {
    case 'whitelist': {
      switch (sub) {

        case 'add': {
          const user  = interaction.options.getUser('user');
          const entry = user ? user.id : interaction.options.getString('value')?.toLowerCase();
          if (!entry) return interaction.reply({ content: '❌ Provide a user or value.', ephemeral: true });
          whitelist.add(entry);
          saveWL(whitelist);
          await interaction.reply({
            embeds: [new EmbedBuilder()
              .setColor(0x57f287)
              .setDescription(`✅ **${user ? user.username : entry}** added to whitelist.`)
            ],
            ephemeral: true,
          });
          break;
        }

        case 'remove': {
          const user  = interaction.options.getUser('user');
          const entry = user ? user.id : interaction.options.getString('value')?.toLowerCase();
          if (!entry) return interaction.reply({ content: '❌ Provide a user or value.', ephemeral: true });
          whitelist.delete(entry);
          saveWL(whitelist);
          await interaction.reply({
            embeds: [new EmbedBuilder()
              .setColor(0xed4245)
              .setDescription(`🗑️ **${user ? user.username : entry}** removed from whitelist.`)
            ],
            ephemeral: true,
          });
          break;
        }

        case 'list': {
          const entries = [...whitelist];
          await interaction.reply({
            embeds: [new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle('📋 Whitelist')
              .setDescription(entries.length ? entries.map(e => `\`${e}\``).join('\n') : 'Empty.')
            ],
            ephemeral: true,
          });
          break;
        }
      }
      break;
    }
  }
});

client.login(process.env.BOT_TOKEN);

// ── register commands ─────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage the join whitelist')
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add a user or username to whitelist')
      .addUserOption(o => o.setName('user').setDescription('Discord user').setRequired(false))
      .addStringOption(o => o.setName('value').setDescription('Username or ID if user not in server').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove from whitelist')
      .addUserOption(o => o.setName('user').setDescription('Discord user').setRequired(false))
      .addStringOption(o => o.setName('value').setDescription('Username or ID').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('list')
      .setDescription('Show current whitelist')
    ),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
rest.put(
  Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID),
  { body: commands }
).then(() => console.log('[Autoban] Commands registered'));
