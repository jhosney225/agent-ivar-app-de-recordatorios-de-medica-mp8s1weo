
```javascript
import Anthropic from "@anthropic-ai/sdk";
import * as readline from "readline";

const client = new Anthropic();

// Conversation history for multi-turn conversation
let conversationHistory = [];

// In-memory medication database
let medications = [];

// Function to add a medication
function addMedication(name, dosage, frequency, time) {
  const medication = {
    id: medications.length + 1,
    name,
    dosage,
    frequency,
    time,
    createdAt: new Date(),
  };
  medications.push(medication);
  return medication;
}

// Function to get all medications
function getAllMedications() {
  return medications;
}

// Function to remove a medication
function removeMedication(id) {
  const index = medications.findIndex((m) => m.id === id);
  if (index > -1) {
    const removed = medications.splice(index, 1);
    return removed[0];
  }
  return null;
}

// Function to get next reminder
function getNextReminder() {
  if (medications.length === 0) return null;

  const now = new Date();
  const upcomingMeds = medications
    .map((med) => {
      const [hours, minutes] = med.time.split(":").map(Number);
      const medTime = new Date();
      medTime.setHours(hours, minutes, 0, 0);

      if (medTime < now) {
        medTime.setDate(medTime.getDate() + 1);
      }

      return {
        ...med,
        nextTime: medTime,
        minutesUntil: Math.floor((medTime - now) / 60000),
      };
    })
    .sort((a, b) => a.nextTime - b.nextTime);

  return upcomingMeds[0];
}

// Format medication list for Claude
function formatMedicationsList() {
  if (medications.length === 0) {
    return "No medications registered yet.";
  }

  let list = "Current medications:\n";
  medications.forEach((med) => {
    list += `- ID: ${med.id}, ${med.name} ${med.dosage}, ${med.frequency} at ${med.time}\n`;
  });

  const nextReminder = getNextReminder();
  if (nextReminder) {
    list += `\nNext reminder: ${nextReminder.name} at ${nextReminder.time} (in ${nextReminder.minutesUntil} minutes)`;
  }

  return list;
}

// Function to process user input with Claude
async function chat(userMessage) {
  // Add user message to history
  conversationHistory.push({
    role: "user",
    content: userMessage,
  });

  // Prepare the context for Claude
  const medicationsContext = formatMedicationsList();

  // Create the system prompt
  const systemPrompt = `You are a helpful medication reminder assistant. You help users manage their medications and medication schedules.

Current medication database:
${medicationsContext}

You can help users:
1. Add new medications with dosage, frequency, and time
2. View all their medications
3. Remove medications
4. Get reminders about upcoming doses
5. Provide medication-related information and advice

When users want to add a medication, ask them for:
- Medication name
- Dosage (e.g., "500mg")
- Frequency (e.g., "twice daily", "once daily", "every 8 hours")
- Time to take it (in HH:MM format, 24-hour)

When a user provides complete information to add a medication, respond with a confirmation that includes the medication details.
Be friendly, helpful, and encourage regular medication adherence.`;

  try {
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversationHistory,
    });

    const assistantMessage =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Add assistant response to history
    conversationHistory.push({
      role: "assistant",
      content: assistantMessage,
    });

    // Process commands from the assistant's response
    processCommands(userMessage, assistantMessage);

    return assistantMessage;
  } catch (error) {
    console.error("Error calling Claude API:", error);
    throw error;
  }
}

// Process commands extracted from user input and Claude's response
function processCommands(userMessage, assistantResponse) {
  const lowerMessage = userMessage.toLowerCase();

  // Check for add medication patterns
  if (
    lowerMessage.includes("add") ||
    lowerMessage.includes("register") ||
    lowerMessage.includes("new medication")
  ) {
    // Extract medication details from user message
    const nameMatch = userMessage.match(
      /(?:add|register|new medication:?)\s+([a-zA-Z\s]+?)(?:\s+\d+mg|\s+dosage|\s+,|$)/i
    );
    const dosageMatch = userMessage.match(/(\d+\s*(?:mg|ml|units|tablets?))/i);
    const timeMatch = userMessage.match(/at\s+(\d{1,2}):(\d{2})/);

    if (nameMatch && dosageMatch && timeMatch) {
      const name = nameMatch[1].trim();
      const dosage = dosageMatch[0];
      const time = `${String(parseInt(timeMatch[1])).padStart(2, "0")}:${timeMatch[2]}`;
      const frequency = userMessage.includes("twice")
        ? "twice daily"
        : userMessage.includes("three times")
          ? "three times daily"
          : "once daily";

      const newMed = addMedication(name, dosage, frequency, time);
      console.log(
        `\n✓ Medication added: ${newMed.name} ${newMed.dosage}, ${newMed