import illustration from "@/assets/illustration.png"
import FormComponent from "@/components/forms/FormComponent"
import TerminalRain from "@/components/ui/terminal-rain"

function HomePage() {
    return (
        <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-dark">
            {/* Full-viewport Terminal Rain Background */}
            <div className="absolute inset-0 h-full w-full pointer-events-auto">
                <TerminalRain
                    colors={['#93fd93ff', '#f3f4f4ff']}
                    backgroundColor="#0A0A0A"
                    density={0.25}
                    trail={13}
                    speed={0.75}
                    variance={0.4}
                    shuffle={0.28}
                    depth={0.40}
                    glow={0.07}
                    intensity={0.45}
                    interactive={true}
                    bulletTime={false}
                    slowStrength={0.3}
                    clickBurst={false}
                    quality={1}
                />
            </div>

            {/* Existing Room Join Interface (layered above background) */}
            <div className="relative z-10 pointer-events-none my-12 flex h-full min-w-full flex-col items-center justify-evenly sm:flex-row sm:pt-0">
                <div className="flex w-full animate-up-down justify-center sm:w-1/2 sm:pl-4">
                    <img
                        src={illustration}
                        alt="Code Verse Illustration"
                        className="mx-auto w-[250px] sm:w-[400px]"
                    />
                </div>
                <div className="pointer-events-auto flex w-full items-center justify-center sm:w-1/2">
                    <FormComponent />
                </div>
            </div>
        </div>
    )
}

export default HomePage
