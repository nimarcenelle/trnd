/**
 * Demo mode, for recording videos. /demo turns it on: the paid tools unlock, but only for the sample student below,
 * whose results are saved ahead of time so every screen answers instantly on camera. Any other essay or list asks for
 * a plan as usual, so demo mode is never free access. Account saving is off while it's on.
 */
export const DEMO_COOKIE = "essayodds_demo";

/** An invented student. Written for the demo, not a real applicant's essay. */
export const DEMO_ESSAY = `The first bike I fixed belonged to Mr. Ortiz, who lived two floors below us and rode to his night shift at the bakery. The chain had rusted stiff. I was eleven, I had a YouTube video and my mother's kitchen oil, and I made it worse before I made it better. When he rode off the next evening, he rang the bell twice.

Our building has forty-two units and most of them have a bike in the hallway. By fourteen I had a toolbox, a waiting list taped to our door, and a rule: I fix it with you, not for you. Teaching Mrs. Chen to true her own wheel took three Saturdays and taught me more about patience than any class.

Last spring I started tracking every repair in a notebook, and I noticed that half the flats came from the same stretch of broken glass on Linden Avenue. I wrote to the city twice. The first letter got a form reply. The second letter, with my numbers in it, got the street swept.

I want to study engineering because I like problems that sit in the real world and talk back. A bike tells you when you're wrong. So did the city, until I brought it data.`;

export const DEMO_ACTIVITIES = `President, Robotics Club
Led weekly meetings for 24 members and raised $3,000 for regionals.

Volunteer, Queens Food Bank
Helped out on weekends sorting donations.

Tutor, self-employed
Tutored kids in math.

Founder, Building Bike Repair
Fixed bikes for neighbors in my 42-unit building.`;

export const DEMO_HONORS = `AP Scholar with Distinction (National)
Regional Science Fair, 2nd place in Engineering (Regional)
Honor Roll (School)`;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export const isDemoEssay = (text: string) => clean(text) === clean(DEMO_ESSAY);
export const isDemoList = (text: string) => [DEMO_ACTIVITIES, DEMO_HONORS].some((d) => clean(d) === clean(text));
