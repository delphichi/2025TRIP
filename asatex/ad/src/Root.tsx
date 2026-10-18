import React from "react";
import { Composition } from "remotion";
import { Ad, DURATION, FPS } from "./Ad";
import { T_DUR, T_FPS, Trailer } from "./Trailer";
import { S_DUR, S_FPS, Showroom } from "./Showroom";
import { E_DUR, E_FPS, Exploded } from "./Exploded";
import { N_DUR, N_FPS, Nochebuena } from "./Nochebuena";
import { NF_DUR, NF_FPS, NochebuenaFull } from "./NochebuenaFull";
import { NR_DUR, NR_FPS, NochebuenaReal } from "./NochebuenaReal";
import { PP_DUR, PP_FPS, PocketPull } from "./PocketPull";
import { PC_DUR, PC_FPS, PocketCall } from "./PocketCall";
import { PO_DUR, PO_FPS, PocketOrbit } from "./PocketOrbit";
import { G_DUR, G_FPS, Guantes, GuantesV, GuantesV3D } from "./Guantes";
import { C_DUR, C_FPS, Compras } from "./Compras";
import { D_DUR, D_FPS, Delivery } from "./Delivery";
import { F_DUR, F_FPS, Fiesta } from "./Fiesta";
import { R_DUR, R_FPS, Rosado } from "./Rosado";
import { S_DUR as STICK_DUR, S_FPS as STICK_FPS, Stick } from "./Stick";
import { StyleSheet } from "./StyleSheet";
import { PowerUp } from "./PowerUp";
import { Fight, Runmo } from "./GameStyles";
import { PC3_DUR, PC3_FPS, ProductCam } from "./ProductCam";
import { M3_DUR, M3_FPS, Mannequin3D } from "./Mannequin3D";
import { AbsSheet } from "./AbsSheet";
import { A3_DUR, Abs3D } from "./Abs3D";
import { H_DUR, Hospital } from "./Hospital";
import { MascotSheet } from "./Mascots";
import { HeroineSheet } from "./Heroines";
import { PeachSheet } from "./PeachLady";
import { FruitGirlSheet } from "./FruitGirls";
import { MissPeachSheet } from "./MissPeach";
import { I_DUR, Insomnia } from "./Insomnia";
import { ClinicTest } from "./ClinicTest";
import { ClinicHosp } from "./ClinicHosp";
import { IH_DUR, InsomniaHosp } from "./InsomniaHosp";
import { TallTest } from "./TallTest";
import { PT_DUR, PoorTall } from "./PoorTall";
import { BR_DUR, Breathe } from "./Breathe";
import { FF_DUR, FeelFul } from "./FeelFul";
import { OctoSheet } from "./OctoV2";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="FeelFul" component={FeelFul} durationInFrames={FF_DUR} fps={30} width={1080} height={1920} />
    <Composition id="FeelFulEN" component={FeelFul} durationInFrames={FF_DUR} fps={30} width={1080} height={1920} defaultProps={{ lang: "en" as const }} />
    <Composition id="OctoSheet" component={OctoSheet} durationInFrames={90} fps={30} width={1600} height={900} />
    <Composition id="Breathe" component={Breathe} durationInFrames={BR_DUR} fps={30} width={1080} height={1920} />
    <Composition id="PoorTall" component={PoorTall} durationInFrames={PT_DUR} fps={30} width={1080} height={1920} />
    <Composition id="TallTest" component={TallTest} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="InsomniaHosp" component={InsomniaHosp} durationInFrames={IH_DUR} fps={30} width={1080} height={1920} />
    <Composition id="ClinicHosp" component={ClinicHosp} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="ClinicTest" component={ClinicTest} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Insomnia" component={Insomnia} durationInFrames={I_DUR} fps={30} width={1080} height={1920} />
    <Composition id="MissPeachSheet" component={MissPeachSheet} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="FruitGirlSheet" component={FruitGirlSheet} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="PeachSheet" component={PeachSheet} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="HeroineSheet" component={HeroineSheet} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="MascotSheet" component={MascotSheet} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Hospital" component={Hospital} durationInFrames={H_DUR} fps={30} width={1080} height={1920} />
    <Composition id="AbsSheet" component={AbsSheet} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Abs3D" component={Abs3D} durationInFrames={A3_DUR} fps={30} width={1080} height={1920} />
    <Composition id="Mannequin3D" component={Mannequin3D} durationInFrames={M3_DUR} fps={M3_FPS} width={1080} height={1920} />
    <Composition id="ProductCam" component={ProductCam} durationInFrames={PC3_DUR} fps={PC3_FPS} width={1080} height={1920} />
    <Composition id="Fight" component={Fight} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Runmo" component={Runmo} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="PowerUp" component={PowerUp} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="StyleSheet" component={StyleSheet} durationInFrames={1} fps={30} width={1080} height={1920} />
    <Composition id="Stick" component={Stick} durationInFrames={STICK_DUR} fps={STICK_FPS} width={1080} height={1920} />
    <Composition id="Rosado" component={Rosado} durationInFrames={R_DUR} fps={R_FPS} width={1080} height={1920} />
    <Composition id="Fiesta" component={Fiesta} durationInFrames={F_DUR} fps={F_FPS} width={1080} height={1920} />
    <Composition id="Delivery" component={Delivery} durationInFrames={D_DUR} fps={D_FPS} width={1080} height={1920} />
    <Composition id="Compras" component={Compras} durationInFrames={C_DUR} fps={C_FPS} width={1080} height={1920} />
    <Composition id="Guantes" component={Guantes} durationInFrames={G_DUR} fps={G_FPS} width={1920} height={1080} />
    <Composition id="GuantesV" component={GuantesV} durationInFrames={G_DUR} fps={G_FPS} width={1080} height={1920} />
    <Composition id="GuantesV3D" component={GuantesV3D} durationInFrames={G_DUR} fps={G_FPS} width={1080} height={1920} />
    <Composition id="Ad" component={Ad} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
    <Composition id="PocketOrbit" component={PocketOrbit} durationInFrames={PO_DUR} fps={PO_FPS} width={1080} height={1920} />
    <Composition id="PocketCall" component={PocketCall} durationInFrames={PC_DUR} fps={PC_FPS} width={1080} height={1920} />
    <Composition id="PocketPull" component={PocketPull} durationInFrames={PP_DUR} fps={PP_FPS} width={1080} height={1920} />
    <Composition id="Trailer" component={Trailer} durationInFrames={T_DUR} fps={T_FPS} width={1920} height={1080} />
    <Composition id="Exploded" component={Exploded} durationInFrames={E_DUR} fps={E_FPS} width={1080} height={1920} />
    <Composition id="NochebuenaReal" component={NochebuenaReal} durationInFrames={NR_DUR} fps={NR_FPS} width={1080} height={1920} />
    <Composition id="NochebuenaFull" component={NochebuenaFull} durationInFrames={NF_DUR} fps={NF_FPS} width={1080} height={1920} />
    <Composition id="Nochebuena" component={Nochebuena} durationInFrames={N_DUR} fps={N_FPS} width={1080} height={1920} />
    <Composition id="Showroom" component={Showroom} durationInFrames={S_DUR} fps={S_FPS} width={1920} height={1080} />
  </>
);
