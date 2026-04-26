export const hooks = [
  "Stop scrolling. This job is for you",
  "Fresher? Don’t miss this opportunity",
  "Still searching for a job? Watch this",
  "Your next job might be here",
  "Looking for your first job?",
  "This company is hiring right now",
  "If you are serious about getting a job, watch this",
  "Apply before this opportunity closes",
  "This could be your career start",
  "New job opening you should not miss"
];

export const bodies = [
  (role, company) => `${company} is hiring for ${role}`,
  (role, company) => `${company} is currently hiring for ${role}`,
  (role, company) => `We are hiring for ${role} at ${company}`,
  (role, company) => `Looking for candidates for ${role} role at ${company}`,
  (role, company) => `${company} is looking for ${role} candidates`,
  (role, company) => `Hiring for ${role} position at ${company}`,
  (role, company) => `Now hiring ${role} at ${company}`,
  (role, company) => `${company} has openings for ${role}`,
  (role, company) => `Looking for freshers for ${role} at ${company}`,
  (role, company) => `${company} is actively hiring ${role}`
];

export const ctas = [
  "Apply now. Link in bio",
  "Check full details in bio",
  "Apply today using the link in bio",
  "Visit the link in bio to apply",
  "Do not miss this opportunity. Link in bio",
  "Apply before it closes. Link in bio",
  "Click the link in bio to apply",
  "Start your application now. Link in bio",
  "Find more details in the bio link",
  "Apply now through the link in bio"
];

export function getReelContent(role, company) {
  const hook = hooks[Math.floor(Math.random() * hooks.length)];
  const body = bodies[Math.floor(Math.random() * bodies.length)](role, company);
  const cta = ctas[Math.floor(Math.random() * ctas.length)];

  return { hook, body, cta };
}
