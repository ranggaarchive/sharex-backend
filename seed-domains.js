const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const domains = [
    { "name": "Academia", "domain": "academia.edu" },
    { "name": "Alight Motion", "domain": "alightmotion.com" },
    { "name": "Apple Music", "domain": "music.apple.com" },
    { "name": "Apple TV+", "domain": "tv.apple.com" },
    { "name": "Beautiful.ai", "domain": "beautiful.ai" },
    { "name": "Bein Sports", "domain": "beinsports.com" },
    { "name": "Brain.fm", "domain": "brain.fm" },
    { "name": "Brilliant", "domain": "brilliant.org" },
    { "name": "Bstation", "domain": "bilibili.tv" },
    { "name": "Busuu", "domain": "busuu.com" },
    { "name": "Bypass | HIX AI", "domain": "hix.ai" },
    { "name": "BypassGPT", "domain": "bypassgpt.ai" },
    { "name": "Canva", "domain": "canva.com" },
    { "name": "CapCut", "domain": "capcut.com" },
    { "name": "ChatGPT", "domain": "chatgpt.com" },
    { "name": "Chutes", "domain": "chutes.ai" },
    { "name": "ClickUp", "domain": "clickup.com" },
    { "name": "Codedex", "domain": "codedex.io" },
    { "name": "Consensus", "domain": "consensus.app" },
    { "name": "Coohom", "domain": "coohom.com" },
    { "name": "Course Hero", "domain": "coursehero.com" },
    { "name": "Coursera", "domain": "coursera.org" },
    { "name": "Crunchyroll", "domain": "crunchyroll.com" },
    { "name": "Curiosity Stream", "domain": "curiositystream.com" },
    { "name": "DataCamp", "domain": "datacamp.com" },
    { "name": "DeepSeek", "domain": "deepseek.com" },
    { "name": "Duolingo", "domain": "duolingo.com" },
    { "name": "Educative", "domain": "educative.io" },
    { "name": "Elicit", "domain": "elicit.com" },
    { "name": "Envato Elements", "domain": "elements.envato.com" },
    { "name": "Epidemic Sound", "domain": "epidemicsound.com" },
    { "name": "Everand", "domain": "everand.com" },
    { "name": "Figma", "domain": "figma.com" },
    { "name": "Flaticon", "domain": "flaticon.com" },
    { "name": "Gemini AI", "domain": "gemini.google.com" },
    { "name": "Grammarly", "domain": "grammarly.com" },
    { "name": "Ground News", "domain": "ground.news" },
    { "name": "iflix", "domain": "iflix.com" },
    { "name": "iLoveIMG", "domain": "iloveimg.com" },
    { "name": "iLovePDF", "domain": "ilovepdf.com" },
    { "name": "iQIYI", "domain": "iqiyi.com" },
    { "name": "Jitter", "domain": "jitter.video" },
    { "name": "LinkedIn Learning", "domain": "linkedin.com/learning" },
    { "name": "Magnific (Freepik)", "domain": "magnific.ai" },
    { "name": "MasterClass", "domain": "masterclass.com" },
    { "name": "Mentimeter", "domain": "mentimeter.com" },
    { "name": "Mermaid Chart", "domain": "mermaidchart.com" },
    { "name": "Motion Array", "domain": "motionarray.com" },
    { "name": "Mubi", "domain": "mubi.com" },
    { "name": "Musicbed", "domain": "musicbed.com" },
    { "name": "Netflix", "domain": "netflix.com" },
    { "name": "NoteGPT", "domain": "notegpt.io" },
    { "name": "Notion", "domain": "notion.so" },
    { "name": "Pacdora", "domain": "pacdora.com" },
    { "name": "Paperpal", "domain": "paperpal.com" },
    { "name": "Perplexity", "domain": "perplexity.ai" },
    { "name": "Picsart", "domain": "picsart.com" },
    { "name": "Prezi AI", "domain": "prezi.com" },
    { "name": "Prime Video", "domain": "primevideo.com" },
    { "name": "ProductionCrate", "domain": "productioncrate.com" },
    { "name": "Quizlet", "domain": "quizlet.com" },
    { "name": "Rawpixel", "domain": "rawpixel.com" },
    { "name": "Relume", "domain": "relume.io" },
    { "name": "Scholarcy", "domain": "scholarcy.com" },
    { "name": "Scite", "domain": "scite.ai" },
    { "name": "Scribd", "domain": "scribd.com" },
    { "name": "Semrush", "domain": "semrush.com" },
    { "name": "Sider AI", "domain": "sider.ai" },
    { "name": "Skillshare", "domain": "skillshare.com" },
    { "name": "Slidesgo", "domain": "slidesgo.com" },
    { "name": "Slideshare", "domain": "slideshare.net" },
    { "name": "Speechify", "domain": "speechify.com" },
    { "name": "Studocu", "domain": "studocu.com" },
    { "name": "SuperGrok", "domain": "supergrok.com" },
    { "name": "Superthread", "domain": "superthread.com" },
    { "name": "SVGator", "domain": "svgator.com" },
    { "name": "Symbolab", "domain": "symbolab.com" },
    { "name": "The Wall Street Journal", "domain": "wsj.com" },
    { "name": "TryHackMe", "domain": "tryhackme.com" },
    { "name": "Turbo AI", "domain": "turbo.ai" },
    { "name": "Turnitin", "domain": "turnitin.com" },
    { "name": "Udemy", "domain": "udemy.com" },
    { "name": "Vectorizer AI", "domain": "vectorizer.ai" },
    { "name": "Virtual Threads", "domain": "virtualthreads.com" },
    { "name": "Viu", "domain": "viu.com" },
    { "name": "WeTV", "domain": "wetv.vip" },
    { "name": "WolframAlpha", "domain": "wolframalpha.com" },
    { "name": "YouTube NoAds", "domain": "youtube.com" }
];

async function main() {
    let count = 0;
    for (const d of domains) {
        const slug = d.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        await prisma.domain.upsert({
            where: { slug: slug },
            update: {},
            create: {
                name: d.name,
                slug: slug,
                url: "https://" + d.domain,
                cookieDomain: "." + d.domain
            }
        });
        count++;
    }
    console.log("Successfully added " + count + " domains.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
