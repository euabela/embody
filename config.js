/*
 * emBODY web — experiment configuration
 * --------------------------------------
 * This is the only file you need to edit to set up an experiment.
 * It is plain JavaScript so it also works when index.html is opened
 * straight from disk (file://). To host several experiments from one
 * deployment, copy this file (e.g. to configs/pilot.js) and open
 * index.html?config=configs/pilot.js
 *
 * Texts may contain HTML. The placeholders ##user##, ##percentage## and
 * ##stimulus## are replaced at run time.
 */
window.EMBODY_CONFIG = {
  // Shown in the browser tab and on the start page
  title: "Emotion Words",

  // "words": stimuli are text labels; "images": stimuli are image URLs
  // (an image stimulus is { label: "Fear", image: "stimuli/fear.jpg" })
  type: "words",

  stimuli: [
    "Nothing special (neutral)",
    "Fear",
    "Anger",
    "Disgust",
    "Sadness",
    "Happiness",
    "Surprise",
    "Anxiety",
    "Love",
    "Depression",
    "Contempt",
    "Pride",
    "Shame",
    "Jealousy"
  ],

  // Present stimuli in a random order per participant (like v1's $randomization)
  randomize: true,

  // Participant IDs: 6-digit random numbers like the original tool.
  // An ID can also be passed in the URL: index.html?id=ABC123 (e.g. Prolific / SONA);
  // allowed characters are letters, digits, "-" and "_".
  allowUrlId: true,

  // Ask the v1 background questions before starting (saved as data.txt).
  demographics: true,

  // Where the data goes. With no endpoint, data stay in this browser and
  // can be exported as a ZIP from admin.html (or by the participant, see below).
  submit: {
    // URL receiving a JSON POST per finished stimulus, e.g. the bundled
    // server (server/server.py -> "/api/submit") or a Google Apps Script
    // web app URL (server/google-apps-script.gs). Leave "" to disable.
    endpoint: "",
    // Let the participant download their own data ZIP at the end
    // (useful when you collect files by e-mail / upload form).
    participantDownload: false
  },

  // Optional: send the participant somewhere when finished,
  // e.g. "https://app.prolific.com/submissions/complete?cc=XXXX"
  completionUrl: "",

  texts: {
    welcome: "Welcome participant ##user##!",
    instructionsTitle: "Preliminary instructions",
    instructions:
      "<p>In this experiment we study whereabouts in their bodies people feel different emotions. " +
      "You will be presented with the name of one emotion (such as happiness), and pictures of two blank " +
      "human bodies. Think carefully what you feel in your body when you feel the corresponding emotion. " +
      "Your task is to color the bodily regions whose activity you feel changing during the emotion " +
      "(in this example happiness).</p>" +
      "<p>For the left body, color the regions whose activity you feel <b>increasing or getting stronger</b> " +
      "when you feel this emotion and for the right body, color the regions whose activity you feel " +
      "<b>decreasing or getting weaker</b> when feeling that emotion. You can color any region of the bodies " +
      "you feel appropriate, from the head to the toes. When you have completed coloring the bodies, click " +
      "the button at the bottom of the screen to proceed to the next page.</p>" +
      "<p>Write down your participant ID (<b>##user##</b>). If you want to take a break, you can continue " +
      "later from the front page in this same browser.</p>",
    start: "Click here to begin",
    resume: "Continue (##percentage##% done)",
    loginPrompt: "Already started? Enter your participant ID",
    loginButton: "Continue",
    newParticipant: "Start as a new participant",
    unknownId: "Participant ID ##user## was not found in this browser.",
    tasklabel: "For the pictures below, evaluate how the activity of your body changes when you feel...",
    leftLabel: "For this body, color the regions whose activity you feel increasing or getting stronger",
    rightLabel: "For this body, color the regions whose activity you feel decreasing or getting weaker",
    forward: "Click here when done",
    reset: "Reset",
    emptyWarning: "You have not colored anything. Continue anyway?",
    help: "Help",
    saving: "Saving…",
    saveError: "There was an error saving the data. Please check your connection and try again.",
    retry: "Try again",
    thankYou: "You have completed 100% of the ratings. Thank you!",
    downloadData: "Download your data",
    rotateHint: "Tip: turn your device sideways for a bigger drawing area.",

    // Background questions (v1 register page)
    rp_title: "Register for the experiment",
    rp_text:
      "Participating in the study is voluntary, and you can terminate the experiment at any point you wish. " +
      "All the data acquired in the study will be treated confidentially and only members of our research " +
      "group will have access to it. It will not be possible for us to identify you on the basis of your responses.",
    rp_submit: "Register",
    rp_missing: "Please answer: ",
    rp_sex: "Gender", rp_male: "Male", rp_female: "Female",
    rp_age: "Age", rp_weight: "Weight", rp_height: "Height", rp_kg: "kg", rp_cm: "cm",
    rp_handedness: "Handedness", rp_left: "Left", rp_right: "Right",
    rp_education: "Education",
    rp_edu1: "Elementary school", rp_edu2: "High school or equivalent", rp_edu3: "Higher education",
    rp_ps1: "Have you ever sought help from a professional psychologist?",
    rp_ps2: "Have you ever sought help from a professional psychiatrist?",
    rp_ps3: "Have you ever sought help from a professional neurologist?",
    rp_y: "Yes", rp_n: "No"
  }
};
